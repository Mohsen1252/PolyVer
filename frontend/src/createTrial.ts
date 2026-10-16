import { reader } from "./chain";
import type { Market } from "./types";
import { retryTransient, waitForFinished, type Receipt, type ReceiptReader } from "./txPath";

export type TrialForm = { title: string; spec: string; urlsText: string; deadline: string };

export const MAX_SOURCES = 6;

export function slug(title: string, nowMs = Date.now()): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base || "market"}-${nowMs.toString(36)}`.slice(0, 64);
}

export function parseSources(urlsText: string): { urls: string[]; hosts: string[] } {
  const urls = urlsText.split(/[\s,]+/).filter(Boolean);
  const hosts = [
    ...new Set(
      urls.map((u) => {
        try {
          return new URL(u).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      }),
    ),
  ];
  return { urls, hosts };
}

export function deadlineTs(deadline: string): number {
  return deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
}

/** Returns a user-facing error string, or null when the form may be submitted. */
export function validateTrialForm(f: TrialForm, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const { urls, hosts } = parseSources(f.urlsText);
  const endTs = deadlineTs(f.deadline);
  if (!f.title.trim()) return "Enter the market question.";
  if (!f.spec.trim()) return "Enter a strict resolution clause.";
  if (urls.length === 0 || urls.length > MAX_SOURCES) return "Provide 1–6 source URLs.";
  if (urls.some((u) => !u.startsWith("https://")) || hosts.includes("")) return "Every source must be a valid https:// URL.";
  if (hosts.length > MAX_SOURCES) return "At most 6 distinct domains.";
  if (!endTs || endTs <= nowSec + 60) return "Pick a resolution deadline in the future.";
  return null;
}

/** The `create_market` call the contract receives: [market_id, title, criteria_spec, whitelist, urls, end_timestamp]. */
export function buildCreateTrialCall(f: TrialForm, nowMs = Date.now()) {
  const { urls, hosts } = parseSources(f.urlsText);
  const marketId = slug(f.title, nowMs);
  return {
    marketId,
    functionName: "create_market",
    args: [marketId, f.title.trim(), f.spec.trim(), hosts, urls, deadlineTs(f.deadline)] as unknown[],
  };
}

export type TrialReader = ReceiptReader & {
  readContract: (a: Record<string, unknown>) => Promise<unknown>;
};

export type CreateTrialResult = {
  marketId: string;
  hash: string;
  receipt: Receipt;
  trial: Market;
  count: number;
};

export type Phase = "validating" | "submitting" | "confirming" | "reading";

/**
 * Whole frontend creation flow, used verbatim by the Create Prediction Trial modal:
 * validate -> wallet write -> poll to ACCEPTED/FINALIZED + FINISHED_WITH_RETURN -> read the trial back.
 */
export async function createTrial(opts: {
  form: TrialForm;
  send: (fn: string, args: unknown[], value?: bigint) => Promise<string>;
  contract: `0x${string}`;
  chainReader?: TrialReader;
  nowMs?: number;
  poll?: { interval?: number; retries?: number };
  onPhase?: (p: Phase, hash?: string) => void;
}): Promise<CreateTrialResult> {
  const { form, send, contract } = opts;
  const rd = (opts.chainReader ?? reader) as unknown as TrialReader;
  const nowMs = opts.nowMs ?? Date.now();
  opts.onPhase?.("validating");
  const err = validateTrialForm(form, Math.floor(nowMs / 1000));
  if (err) throw new Error(err);
  const call = buildCreateTrialCall(form, nowMs);
  opts.onPhase?.("submitting");
  const hash = await send(call.functionName, call.args);
  opts.onPhase?.("confirming", hash);
  const receipt = await waitForFinished(rd, hash, opts.poll);
  opts.onPhase?.("reading", hash);
  const trial = (await retryTransient(() =>
    rd.readContract({ address: contract, functionName: "get_market", args: [call.marketId], jsonSafeReturn: true }),
  )) as Market;
  if (!trial || trial.market_id !== call.marketId) {
    throw new Error(`Trial ${call.marketId} not found on-chain after ${hash}`);
  }
  const count = Number(
    await retryTransient(() =>
      rd.readContract({ address: contract, functionName: "get_market_count", args: [], jsonSafeReturn: true }),
    ),
  );
  return { marketId: call.marketId, hash, receipt, trial, count };
}
