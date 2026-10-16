import { createClient } from "genlayer-js";
import { CHAIN_ID_HEX, CONTRACT_ADDRESS, EXPLORER_URL, RPC_URL, chain } from "./chain";

export type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
};

export async function ensureChain(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    if ((e as { code?: number }).code === 4902 || /Unrecognized chain/i.test(String(e))) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "GenLayer Studio Next",
            nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

export type TxFees = { distribution: unknown; messageAllocations?: unknown; feeValue: bigint; policy?: unknown };

type FeeEstimator = { estimateTransactionFees: () => Promise<TxFees> };

/**
 * Fee/gas configuration derived from the live fee policy (consensus FeeManager math) rather than hard-coded:
 * a bare non-zero `feeValue` with an empty distribution is rejected by Studio Next (FeeValueMustBeNonZero),
 * because the deposit must cover the distribution's leader/validator time units and execution budget.
 */
export async function deriveFees(client: FeeEstimator): Promise<TxFees> {
  const est = await client.estimateTransactionFees();
  if (!(est.feeValue > 0n)) throw new Error("Fee estimation returned a zero feeValue");
  return { distribution: est.distribution, messageAllocations: est.messageAllocations, feeValue: est.feeValue };
}

/** The exact argument object handed to `client.writeContract` for every wallet write. */
export function buildWriteParams(fn: string, args: unknown[], value: bigint, fees: TxFees) {
  return { address: CONTRACT_ADDRESS, functionName: fn, args, value, fees };
}

/** Wallet-backed write: ensure chain -> derive fees -> genlayer-js writeContract -> EIP-1193 eth_sendTransaction. Returns the tx hash. */
export async function sendWrite(
  provider: Eip1193,
  address: `0x${string}`,
  fn: string,
  args: unknown[],
  value = 0n,
): Promise<string> {
  await ensureChain(provider);
  const client = createClient({ chain, endpoint: RPC_URL, account: address, provider: provider as never });
  const fees = await deriveFees(client as unknown as FeeEstimator);
  const hash = await client.writeContract(buildWriteParams(fn, args, value, fees) as never);
  return String(hash);
}

export type Receipt = {
  statusName?: string;
  status_name?: string;
  status?: number | string;
  txExecutionResultName?: string;
  [k: string]: unknown;
};

export const DECIDED_STATUSES = ["ACCEPTED", "FINALIZED"];
/** GenLayer consensus status codes that count as decided. */
const STATUS_BY_CODE: Record<string, string> = { "5": "ACCEPTED", "7": "FINALIZED" };

/** The receipt carries the status as `status_name` (Studio) or `statusName` (getTransaction), plus a numeric `status`. */
export function receiptStatus(r: Receipt): string | undefined {
  return r.statusName ?? r.status_name ?? (r.status !== undefined ? STATUS_BY_CODE[String(r.status)] : undefined);
}

/** A write only counts as done once consensus accepted/finalized it AND the contract call returned (did not revert). */
export function assertFinished(hash: string, r: Receipt): void {
  const status = receiptStatus(r);
  if (!status || !DECIDED_STATUSES.includes(status)) {
    throw new Error(`Transaction ${hash} did not reach ACCEPTED/FINALIZED (status: ${status ?? "unknown"})`);
  }
  if (r.txExecutionResultName !== "FINISHED_WITH_RETURN") {
    throw new Error(
      `Transaction ${hash} reached ${status} but execution was ${r.txExecutionResultName ?? "unknown"}, not FINISHED_WITH_RETURN`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public Studio Next RPC allows ~30 requests/minute and sometimes 429/503s: ride those out. */
export function isTransient(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return /rate limit|busy|too many|failed to fetch|timed out|not found|429|503|502|network/.test(msg);
}

export async function retryTransient<T>(fn: () => Promise<T>, opts: { retries?: number; delayMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 8;
  const delayMs = opts.delayMs ?? 4000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isTransient(e)) throw e;
      await sleep(delayMs + attempt * 2000);
    }
  }
}

export type ReceiptReader = {
  waitForTransactionReceipt: (a: { hash: string; waitUntil?: string; interval?: number; retries?: number }) => Promise<unknown>;
};

/** Poll the chain until `hash` is decided (ACCEPTED/FINALIZED), then require FINISHED_WITH_RETURN. */
export async function waitForFinished(
  reader: ReceiptReader,
  hash: string,
  opts: { interval?: number; retries?: number; timeoutMs?: number } = {},
): Promise<Receipt> {
  const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
  for (;;) {
    try {
      const receipt = (await reader.waitForTransactionReceipt({
        hash,
        waitUntil: "decided",
        interval: opts.interval ?? 5000,
        retries: opts.retries ?? 20,
      })) as Receipt;
      assertFinished(hash, receipt);
      return receipt;
    } catch (e) {
      if (!isTransient(e) || Date.now() > deadline) throw e;
      await sleep(opts.interval ?? 5000);
    }
  }
}
