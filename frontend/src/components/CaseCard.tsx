import { ArrowUpRight, Coins, FileText } from "lucide-react";
import { OUTCOME_LABEL, caseLabel, fmtGen, fmtTime, toBig } from "../lib";
import type { Market } from "../types";
import type { Wallet } from "../wallet";
import { ChallengeCountdown } from "./ActionPanel";
import { SourceBadge, StatusBadge } from "./Badges";

type Props = { market: Market; wallet: Wallet; onOpen: () => void; onRefresh: () => void };

export function CaseCard({ market: m, wallet, onOpen, onRefresh }: Props) {
  const yes = toBig(m.yes_pool);
  const no = toBig(m.no_pool);
  const total = yes + no;
  const yesPct = total === 0n ? 50 : Number((yes * 1000n) / total) / 10;
  const verdict = m.final_verdict ? m.final_verdict_name : m.proposed_outcome ? m.proposed_outcome_name : null;

  return (
    <article className="group flex flex-col rounded-xl border border-slate-800 bg-panel p-5 transition hover:border-verdict/60">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <span className="ticker min-w-0 max-w-full truncate text-[11px] tracking-widest text-slate-500">
          {caseLabel(m.market_id)} · {m.market_id}
        </span>
        <StatusBadge status={m.status_name} />
      </div>

      <h3 className="serif mt-3 text-xl leading-snug text-slate-100">{m.title}</h3>

      <div className="mt-3 rounded-md border border-slate-800 bg-[#08090d] p-3">
        <div className="ticker mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
          <FileText size={11} aria-hidden /> Resolution clause
        </div>
        <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-400">{m.criteria_spec}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {m.source_whitelist.map((d) => (
          <SourceBadge key={d} domain={d} />
        ))}
      </div>

      <div className="mt-4">
        <div className="ticker mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 text-emerald-300">YES {fmtGen(yes)}</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Coins size={11} aria-hidden /> {fmtGen(total)} GEN pool
          </span>
          <span className="text-rose-300">NO {fmtGen(no)}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded bg-slate-800">
          <div className="bg-emerald-500/80" style={{ width: `${yesPct}%` }} />
          <div className="bg-rose-500/80" style={{ width: `${100 - yesPct}%` }} />
        </div>
      </div>

      <div className="ticker mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-[11px] text-slate-500">
        <span className="whitespace-nowrap">Ends {fmtTime(m.end_timestamp)}</span>
        {verdict && (
          <span className="whitespace-nowrap rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">
            {m.final_verdict ? "VERDICT" : "TENTATIVE"}: {OUTCOME_LABEL[verdict] ?? verdict}
          </span>
        )}
      </div>

      {m.status_name === "TENTATIVE_RESOLVED" && (
        <div className="mt-4">
          <ChallengeCountdown market={m} wallet={wallet} onDone={onRefresh} compact />
        </div>
      )}

      <button
        onClick={onOpen}
        className="mt-4 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-verdict hover:text-white"
      >
        Open Evidence Room <ArrowUpRight size={14} aria-hidden />
      </button>
    </article>
  );
}
