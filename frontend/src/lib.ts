import { useEffect, useState } from "react";
import deployment from "../../deployments/studio-next.json";
import type { Market, StatusName } from "./types";

export const GEN = 10n ** 18n;

export function toBig(v: number | string | bigint | undefined): bigint {
  if (v === undefined) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.round(v));
  return BigInt(v);
}

/** Wei -> GEN string with up to `dp` decimals, trailing zeros trimmed. */
export function fmtGen(v: number | string | bigint | undefined, dp = 4): string {
  const n = toBig(v);
  const whole = n / GEN;
  const frac = (n % GEN).toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "—";
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((x) => String(x).padStart(2, "0")).join(":");
}

export function fmtTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export const STATUS_LABEL: Record<StatusName, string> = {
  OPEN: "OPEN",
  RESOLVING: "RESOLVING",
  TENTATIVE_RESOLVED: "TENTATIVE",
  DISPUTED: "DISPUTED",
  FINALIZED: "FINALIZED",
  VOIDED: "VOIDED",
};

export const OUTCOME_LABEL: Record<string, string> = {
  YES: "YES",
  NO: "NO",
  AMBIGUOUS_VOID: "AMBIGUOUS · VOID",
  UNRESOLVED: "UNRESOLVED",
};

/** Mirrors the contract's deterministic derivation so the UI can show its working. */
export function derivationSteps(m: Market) {
  const read = m.telemetry.filter((t) => t.ok);
  const stances = read.map((t) => t.stance ?? "UNCLEAR");
  const yes = stances.filter((s) => s === "YES").length;
  const no = stances.filter((s) => s === "NO").length;
  const definitive = yes + no;
  const need = Math.min(2, read.length);
  return [
    { label: "Sources read", value: `${read.length}/${m.telemetry.length}`, pass: read.length > 0 },
    { label: "No source conflict (YES vs NO)", value: yes > 0 && no > 0 ? "CONFLICT" : "clean", pass: !(yes > 0 && no > 0) },
    { label: `Corroboration ≥ ${need} definitive`, value: `${definitive} definitive`, pass: definitive >= need && definitive > 0 },
  ];
}

const CASE_KEYS = Object.entries((deployment as unknown as { cases?: Record<string, { market_id: string }> }).cases ?? {}).map(
  ([key, v]) => [v.market_id, key] as const,
);
const KEY_OF = new Map(CASE_KEYS);

/** "case-2b" -> "CASE #2B"; markets outside the seeded dossier fall back to their id. */
export function caseLabel(marketId: string): string {
  const key = KEY_OF.get(marketId);
  return key ? key.replace("case-", "CASE #").toUpperCase() : "CASE";
}

/** Docket order follows the case keys (1, 2a, 2b, 3, 4, 5); unknown markets sort last. */
export function caseRank(marketId: string): string {
  return KEY_OF.get(marketId) ?? `zz-${marketId}`;
}
