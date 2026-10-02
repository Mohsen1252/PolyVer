import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Gavel, Landmark, Loader2, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { cachedCourt, loadCourt } from "./api";
import { CONTRACT_ADDRESS, CONTRACT_URL } from "./chain";
import { CaseCard } from "./components/CaseCard";
import { EvidenceRoom } from "./components/EvidenceRoom";
import { Navbar } from "./components/Navbar";
import { CreateMarketModal } from "./components/CreateMarketModal";
import { ProtocolDrawer } from "./components/ProtocolDrawer";
import { caseRank, fmtGen, shortAddr } from "./lib";
import type { CourtData } from "./types";
import { useWallet } from "./wallet";

export default function App() {
  const wallet = useWallet();
  const [data, setData] = useState<CourtData | null>(() => cachedCourt());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [protocol, setProtocol] = useState(false);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadCourt());
      setError(null);
    } catch (e) {
      setError((e as Error).message?.split("\n")[0] ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = data?.markets.find((m) => m.market_id === selected);

  return (
    <div className="min-h-screen">
      <Navbar wallet={wallet} onProtocol={() => setProtocol(true)} />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6">
        <section className="mb-10 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="ticker mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-gavel">
              <Scale size={13} aria-hidden /> Autonomous prediction-market court
            </p>
            <h1 className="serif text-4xl leading-[1.05] text-slate-50 sm:text-5xl">
              Disputed markets, settled by <span className="text-verdict">validator consensus</span>.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400">
              Validators scrape authorised news sources, a multi-LLM panel reaches a verdict under the Equivalence Principle, and an
              optimistic bond game lets anyone challenge it. Ambiguous evidence never guesses — it refunds.
            </p>
          </div>
          <Ledger data={data} />
        </section>

        <div className="mb-5 flex flex-nowrap items-center justify-between gap-3">
          <h2 className="serif whitespace-nowrap text-2xl text-slate-100">Active Cases Dossier</h2>
          <div className="flex flex-nowrap items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-verdict px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_rgba(99,102,241,0.35)] transition hover:bg-indigo-400"
          >
            <Gavel size={14} aria-hidden /> Create Prediction Trial
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="ticker inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-600 disabled:opacity-60"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden /> Refresh
          </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Could not read the court from Studio Next: {error}
          </div>
        )}
        {wallet.error && <p className="mb-4 text-sm text-amber-300">{wallet.error}</p>}

        {loading && !data ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 p-8 text-slate-400">
            <Loader2 className="animate-spin" size={18} aria-hidden /> Reading the docket from {shortAddr(CONTRACT_ADDRESS)}…
          </div>
        ) : data && data.markets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 p-8 text-slate-400">No cases on the docket yet.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[...(data?.markets ?? [])]
              .sort((a, b) => caseRank(a.market_id).localeCompare(caseRank(b.market_id)))
              .map((m) => (
              <CaseCard key={m.market_id} market={m} jury={data?.juries[m.market_id]} wallet={wallet} onOpen={() => setSelected(m.market_id)} onRefresh={refresh} />
            ))}
          </div>
        )}

        <footer className="ticker mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-6 text-[11px] text-slate-600">
          <span>PolyVerdict · GenLayer Studio Next (61997) · testnet GEN has no value</span>
          <a href={CONTRACT_URL} target="_blank" rel="noreferrer" className="hover:text-slate-400">
            {CONTRACT_ADDRESS}
          </a>
        </footer>
      </main>

      {open && data && (
        <EvidenceRoom
          market={open}
          jury={data.juries[open.market_id]}
          wallet={wallet}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}
      {creating && <CreateMarketModal wallet={wallet} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void refresh(); }} />}
      <ProtocolDrawer open={protocol} onClose={() => setProtocol(false)} />
    </div>
  );
}

function Ledger({ data }: { data: CourtData | null }) {
  const a = data?.accounting;
  const rows: [string, string][] = [
    ["Open pools", a ? `${fmtGen(a.pool_held)} GEN` : "…"],
    ["Bonds in escrow", a ? `${fmtGen(a.locked_bonds)} GEN` : "…"],
    ["Safety vault", a ? `${fmtGen(a.vault)} GEN` : "…"],
  ];
  return (
    <div className="rounded-xl border border-slate-800 bg-panel p-5">
      <div className="ticker mb-3 flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Landmark size={12} aria-hidden /> Court ledger
        </span>
        {a && (
          <span className={`inline-flex items-center gap-1 ${a.invariant_ok ? "text-emerald-400" : "text-rose-400"}`}>
            <ShieldCheck size={12} aria-hidden /> {a.invariant_ok ? "balanced" : "IMBALANCE"}
          </span>
        )}
      </div>
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-slate-800/70 pb-2 last:border-0">
            <dt className="text-sm text-slate-400">{k}</dt>
            <dd className="ticker text-lg text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
