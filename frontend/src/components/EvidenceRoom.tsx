import { useEffect } from "react";
import { CheckCircle2, ExternalLink, Gavel, Radio, Scale, X, XCircle } from "lucide-react";
import deployment from "../../../deployments/studio-next.json";
import { txUrl } from "../chain";
import { OUTCOME_LABEL, derivationSteps, domainOf, fmtGen, fmtTime, shortAddr, toBig } from "../lib";
import type { Jury, Market, TxRecord } from "../types";
import type { Wallet } from "../wallet";
import { ActionPanel } from "./ActionPanel";
import { Chip, StatusBadge } from "./Badges";

type Props = { market: Market; jury?: Jury; wallet: Wallet; onClose: () => void; onRefresh: () => void };

const TXS = (deployment as unknown as { transactions?: TxRecord[] }).transactions ?? [];

export function EvidenceRoom({ market: m, jury, wallet, onClose, onRefresh }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const proposeTx = TXS.find((t) => t.market_id === m.market_id && t.fn === "propose_resolution");
  const juryTx = TXS.find((t) => t.market_id === m.market_id && t.fn === "resolve_disputed_market");
  const steps = derivationSteps(m);
  const resolved = m.telemetry.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Evidence Room">
      <div className="fade-in absolute inset-0 bg-black/70" onClick={onClose} />
      <section className="slide-in relative flex h-full w-full max-w-[1200px] flex-col border-l border-slate-800 bg-[#0a0b11]">
        <header className="flex flex-nowrap items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="ticker flex flex-wrap items-center gap-3 text-[11px] tracking-widest text-slate-500">
              EVIDENCE ROOM · {m.market_id} <StatusBadge status={m.status_name} finalVerdict={m.final_verdict} />
            </div>
            <h2 className="serif mt-2 text-2xl leading-tight text-slate-100">{m.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close evidence room"
            className="shrink-0 rounded-md border border-slate-800 p-2 text-slate-400 transition hover:border-slate-600 hover:text-white"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:divide-x lg:divide-slate-800 lg:overflow-hidden">
          {/* LEFT — telemetry reader */}
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
            <h3 className="ticker mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-indigo-300">
              <Radio size={13} aria-hidden /> Telemetry Reader · scraped sources
            </h3>
            <div className="rounded-md border border-slate-800 bg-[#08090d] p-3 text-[13px] leading-relaxed text-slate-400">
              <span className="ticker text-[10px] uppercase tracking-widest text-slate-500">Resolution clause</span>
              <p className="mt-1">{m.criteria_spec}</p>
            </div>

            {!resolved && (
              <div className="mt-4 rounded-md border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                No telemetry yet. Validators scrape these authorised sources only when a resolution is proposed:
                <ul className="ticker mt-3 space-y-1 text-xs text-slate-500">
                  {m.source_urls.map((u) => (
                    <li key={u}>• {u}</li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="mt-4 space-y-3">
              {m.telemetry.map((t, i) => (
                <li key={t.url} className="rounded-lg border border-slate-800 bg-panel p-4">
                  <div className="flex flex-nowrap items-center justify-between gap-2 whitespace-nowrap">
                    <span className="ticker truncate text-[11px] text-slate-500">
                      SRC {i + 1} · {domainOf(t.url)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`ticker text-[10px] ${t.ok ? "text-emerald-400" : "text-rose-400"}`}>
                        HTTP {t.status || "ERR"}
                      </span>
                      {t.stance && <Chip kind={t.stance}>{t.stance}</Chip>}
                    </span>
                  </div>
                  {t.ok ? (
                    <>
                      <p className="serif mt-2 text-base leading-snug text-slate-100">{t.headline || "(no headline)"}</p>
                      <p className="ticker mt-2 rounded border border-slate-800 bg-[#08090d] p-2 text-[11px] leading-relaxed text-slate-400">
                        {t.excerpt}
                      </p>
                      {t.quote && (
                        <blockquote className="mt-2 border-l-2 border-verdict pl-3 text-xs italic text-slate-300">
                          “{t.quote}”
                        </blockquote>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-rose-300/80">Source unreadable — excluded from the verdict.</p>
                  )}
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ticker mt-2 inline-flex items-center gap-1 break-all text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    {t.url} <ExternalLink size={10} aria-hidden />
                  </a>
                </li>
              ))}
            </ol>
          </div>

          {/* RIGHT — deliberation transcript */}
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
            <h3 className="ticker mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-amber-300">
              <Scale size={13} aria-hidden /> Multi-Validator Deliberation Transcript
            </h3>

            <TranscriptRound title="Round 1 · Optimistic resolution" accent="indigo">
              {resolved ? (
                <>
                  <p className="text-[13px] text-slate-300">
                    Proposed by <span className="ticker text-slate-100">{shortAddr(m.tentative_resolver)}</span> with a{" "}
                    {fmtGen(m.resolution_bond || 100000000000000000n)} GEN bond at {fmtTime(m.resolved_at)}.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {steps.map((s) => (
                      <li key={s.label} className="flex items-center gap-2 text-xs text-slate-300">
                        {s.pass ? (
                          <CheckCircle2 size={13} className="shrink-0 text-emerald-400" aria-hidden />
                        ) : (
                          <XCircle size={13} className="shrink-0 text-rose-400" aria-hidden />
                        )}
                        <span>{s.label}</span>
                        <span className="ticker ml-auto text-slate-500">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                  <VoteRecord tx={proposeTx} />
                </>
              ) : (
                <p className="text-sm text-slate-500">Awaiting a bonded proposer. No deliberation has occurred.</p>
              )}
            </TranscriptRound>

            {jury?.convened && jury.ballots && (
              <TranscriptRound title="Round 2 · Supreme Court jury (7 jurors, 5-of-7 quorum)" accent="rose">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="ticker text-xs text-slate-300">
                    YES {jury.yes} · NO {jury.no} · VOID {jury.void}
                  </span>
                  <span className="ticker rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-amber-300">
                    {jury.agreement_pct}% agreement
                  </span>
                </div>
                <ul className="space-y-2">
                  {jury.ballots.map((b) => (
                    <li key={b.id} className="rounded border border-slate-800 bg-[#08090d] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="ticker text-[11px] text-slate-400">
                          Juror {b.id} · {b.lens}
                        </span>
                        <Chip kind={b.vote}>{b.vote}</Chip>
                      </div>
                      {b.reason && <p className="mt-1 text-xs text-slate-400">{b.reason}</p>}
                    </li>
                  ))}
                </ul>
                <VoteRecord tx={juryTx} />
              </TranscriptRound>
            )}

            {resolved && (
              <TranscriptRound title="Final semantic interpretation" accent="amber">
                <p className="text-[13px] leading-relaxed text-slate-200">
                  {m.evidence_summary || "No consensus digest recorded."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Gavel size={14} className="text-amber-300" aria-hidden />
                  <span className="ticker text-sm font-semibold text-amber-200">
                    {m.final_verdict
                      ? `FINAL: ${OUTCOME_LABEL[m.final_verdict_name] ?? m.final_verdict_name}`
                      : `TENTATIVE: ${OUTCOME_LABEL[m.proposed_outcome_name] ?? m.proposed_outcome_name}`}
                  </span>
                </div>
              </TranscriptRound>
            )}

            <div className="mt-5">
              <ActionPanel market={m} wallet={wallet} onDone={onRefresh} />
            </div>

            <dl className="ticker mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-800 p-3 text-[11px] text-slate-400">
              <dt>YES pool</dt>
              <dd className="text-right text-slate-200">{fmtGen(m.yes_pool)} GEN</dd>
              <dt>NO pool</dt>
              <dd className="text-right text-slate-200">{fmtGen(m.no_pool)} GEN</dd>
              <dt>Proposer fee (1%)</dt>
              <dd className="text-right text-slate-200">{fmtGen(m.fee_amount)} GEN</dd>
              <dt>Distributable</dt>
              <dd className="text-right text-slate-200">
                {m.distributable && toBig(m.distributable) > 0n ? `${fmtGen(m.distributable)} GEN` : "—"}
              </dd>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

function TranscriptRound({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "indigo" | "rose" | "amber";
  children: React.ReactNode;
}) {
  const bar = { indigo: "border-l-indigo-500", rose: "border-l-rose-500", amber: "border-l-amber-500" }[accent];
  return (
    <div className={`mb-4 rounded-lg border border-slate-800 border-l-2 ${bar} bg-panel p-4`}>
      <h4 className="ticker mb-3 text-[11px] uppercase tracking-widest text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

function VoteRecord({ tx }: { tx?: TxRecord }) {
  if (!tx) return null;
  const votes = Object.values(tx.votes ?? {});
  return (
    <div className="mt-3 rounded border border-slate-800 bg-[#08090d] p-2.5">
      <div className="ticker mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500">
        <span>On-chain validator votes</span>
        <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-slate-300">
          {tx.hash.slice(0, 10)}… <ExternalLink size={10} aria-hidden />
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {votes.map((v, i) => (
          <span
            key={i}
            className={`ticker rounded border px-1.5 py-0.5 text-[10px] ${
              v === "agree" ? "border-emerald-500/40 text-emerald-300" : v === "disagree" ? "border-rose-500/40 text-rose-300" : "border-slate-700 text-slate-500"
            }`}
          >
            V{i + 1} {v}
          </span>
        ))}
        <span className="ticker ml-auto text-[11px] text-amber-300">
          {tx.result_name}
          {typeof tx.agree === "number" && typeof tx.total === "number"
            ? ` · ${tx.agree}/${tx.total} agree`
            : ""}
        </span>
      </div>
    </div>
  );
}
