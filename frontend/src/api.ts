import { CONTRACT_ADDRESS, reader } from "./chain";
import type { Accounting, CourtData, Jury, Market } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public Studio Next RPC allows ~30 requests/minute: back off and retry on 429-style errors. */
async function read<T>(functionName: string, args: (string | number | bigint)[] = []): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await reader.readContract({
        address: CONTRACT_ADDRESS,
        functionName,
        args: args as never,
        jsonSafeReturn: true,
      } as never);
      return out as T;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (attempt >= 5 || !(msg.includes("rate limit") || msg.includes("busy") || msg.includes("too many"))) throw e;
      await sleep(8000 + attempt * 4000);
    }
  }
}

const CACHE_KEY = `pv-court-${CONTRACT_ADDRESS}`;
export function cachedCourt(): CourtData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CourtData) : null;
  } catch {
    return null;
  }
}

export async function loadCourt(): Promise<CourtData> {
  const count = Number(await read<number>("get_market_count"));
  const ids = await Promise.all(
    Array.from({ length: count }, (_, i) => read<string>("get_market_id_at", [i])),
  );
  const markets = await Promise.all(ids.map((id) => read<Market>("get_market", [id])));
  const juries: Record<string, Jury> = {};
  await Promise.all(
    markets
      .filter((m) => m.status === 3 || m.status === 4 || m.status === 5)
      .map(async (m) => {
        juries[m.market_id] = await read<Jury>("get_jury_verdict", [m.market_id]);
      }),
  );
  const accounting = await read<Accounting>("get_accounting");
  const court = { markets, juries, accounting, loadedAt: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(court));
  } catch {
    /* storage unavailable: caching is optional */
  }
  return court;
}
