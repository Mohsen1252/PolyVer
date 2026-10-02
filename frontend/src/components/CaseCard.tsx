import { ArrowUpRight, Coins, ExternalLink, FileText, Lock, Scale } from "lucide-react";
import { OUTCOME_LABEL, caseLabel, fmtGen, fmtTime, shortAddr, toBig } from "../lib";
import type { Jury, Market } from "../types";
import type { Wallet } from "../wallet";
import { ChallengeCountdown } from "./ActionPanel";
import { CardActions } from "./CardActions";
import { SourceBadge, StatusBadge } from "./Badges";

type Props = { market: Market; jury?: Jury; wallet: Wallet; onOpen: () => void; onRefresh: () => void };

function bondStatus(m: Market): string {
  const rb = toBig(m.resolution_bond);
  const cb = toBig(m.challenge_bond);
  if (m.status_name === "OPEN") return "No proposer yet — 0.1 GEN bond required to open deliberation";
  if (m.status_name === "TENTATIVE_RESOLVED") return `${fmtGen(rb)} GEN locked · ${shortAddr(m.tentative_resolver)}`;
  if (m.status_name === "DISPUTED") return `${fmtGen(rb)} GEN proposer + ${fmtGen(cb)} GEN challenger locked`;
  return "Bonds settled (returned or slashed)";
}

function jurySummary(m: Market, jury?: Jury): string {
  if (jury?.convened)
    return `YES ${jury.yes} · NO ${jury.no} · VOID ${jury.void} — ${jury.agreement_pct}% agreement → ${jury.outcome_name}`;
  if (m.status_name === "DISPUTED") return "Dispute filed — awaiting the 7-juror panel (5-of-7 quorum)";
  if (m.status_name === "TENTATIVE_RESOLVED") return "Not convened — convenes only if the verdict is challenged";
  if (m.status_name === "OPEN") return "No verdict yet";
  return "Uncontested — no jury needed";
}

export function CaseCard({ market: m, jury, wallet, onOpen, onRefresh }: Props) {
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
        <StatusBadge status={m.status_name} finalVerdict={m.final_verdict} />
      </div>

      <h3 className="serif mt-3 text-xl leading-snug text-slate-100">{m.title}</h3>

      <div className="mt-3 rounded-md border border-slate-800 bg-[#08090d] p-3">
        <div className="ticker mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
          <FileText size={11} aria-hidden /> Resolution clause
        </div>
        <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-400">{m.criteria_spec}</p>
      </div>

      <div className="mt-3">
        <div className="ticker mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">Resolution sources</div>
        <ul className="space-y-1">
          {m.source_urls.map((u) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noreferrer" title={u} className="ticker flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-300">
                <ExternalLink size={10} className="shrink-0" aria-hidden />
                <span className="truncate">{u.replace(/^https:\/\//, "")}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.source_whitelist.map((d) => (
            <SourceBadge key={d} domain={d} />
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="ticker mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-emerald-300">YES {fmtGen(yes)} · {Math.round(yesPct)}%</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Coins size={11} aria-hidden /> {fmtGen(total)} GEN
          </span>
          <span className="text-rose-300">{Math.round(100 - yesPct)}% · NO {fmtGen(no)}</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded bg-slate-800">
          <div className="bg-emerald-500/80" style={{ width: `${yesPct}%` }} />
          <div className="bg-rose-500/80" style={{ width: `${100 - yesPct}%` }} />
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-[12px]">
        <div className="flex items-start gap-2">
          <Lock size={12} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
          <div>
            <dt className="ticker text-[10px] uppercase tracking-widest text-slate-500">Proposer bond</dt>
            <dd className="text-slate-300">{bondStatus(m)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Scale size={12} className="mt-0.5 shrink-0 text-orange-300" aria-hidden />
          <div>
            <dt className="ticker text-[10px] uppercase tracking-widest text-slate-500">7-juror deliberation</dt>
            <dd className="text-slate-300">{jurySummary(m, jury)}</dd>
          </div>
        </div>
      </dl>

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

      <CardActions market={m} wallet={wallet} onDone={onRefresh} />

      <button
        onClick={onOpen}
        className="mt-3 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-verdict hover:text-white"
      >
        Open Evidence Room <ArrowUpRight size={14} aria-hidden />
      </button>
    </article>
  );
}
