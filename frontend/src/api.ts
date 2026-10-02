import { CONTRACT_ADDRESS, reader } from "./chain";
import type { Accounting, CourtData, Jury, Market } from "./types";

async function read<T>(functionName: string, args: (string | number | bigint)[] = []): Promise<T> {
  const out = await reader.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never,
    jsonSafeReturn: true,
  } as never);
  return out as T;
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
  return { markets, juries, accounting, loadedAt: Date.now() };
}
