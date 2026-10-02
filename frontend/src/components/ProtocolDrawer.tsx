import { useEffect, useState } from "react";
import { BookOpenCheck, Brain, Coins, Gavel, X } from "lucide-react";

const TABS = [
  { id: "optimistic", label: "Optimistic Oracle", icon: Gavel },
  { id: "slashing", label: "Slashing Economics", icon: Coins },
  { id: "consensus", label: "Truth Consensus", icon: Brain },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function ProtocolDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("optimistic");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Protocol">
      <div className="fade-in absolute inset-0 bg-black/70" onClick={onClose} />
      <aside className="slide-in relative flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-[#0a0b11]">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="serif flex items-center gap-2 text-xl text-slate-100">
            <BookOpenCheck size={18} className="text-verdict" aria-hidden /> Architectural Protocol
          </h2>
          <button onClick={onClose} aria-label="Close protocol" className="rounded-md border border-slate-800 p-2 text-slate-400 hover:text-white">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div role="tablist" className="flex flex-nowrap gap-1 overflow-x-auto border-b border-slate-800 px-4 pt-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition ${
                tab === id ? "border-verdict text-white" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={14} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-[14px] leading-relaxed text-slate-300">
          {tab === "optimistic" && <Optimistic />}
          {tab === "slashing" && <Slashing />}
          {tab === "consensus" && <Consensus />}
        </div>
      </aside>
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="serif mb-2 mt-5 text-lg text-slate-100 first:mt-0">{children}</h3>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <pre className="ticker my-3 overflow-x-auto rounded-md border border-slate-800 bg-[#08090d] p-3 text-[11px] leading-relaxed text-slate-300">
    {children}
  </pre>
);

function Optimistic() {
  return (
    <>
      <H>Assume honest, punish dishonest</H>
      <p>
        Anyone can post a <b className="text-slate-100">0.1 GEN</b> bond and call <code className="ticker text-amber-300">propose_resolution</code>.
        Validators scrape the market’s whitelisted sources and reach consensus on a tentative verdict. A{" "}
        <b className="text-slate-100">24-hour challenge window</b> opens. Silence is acceptance: if nobody contests, anyone may call{" "}
        <code className="ticker text-amber-300">finalize_resolution</code> and the proposer recovers the bond plus a 1% pool fee.
      </p>
      <Code>{`OPEN ─propose(0.1)→ TENTATIVE ─24h quiet→ FINALIZED | VOIDED
                       └─challenge(0.2)→ DISPUTED ─7 jurors→ FINALIZED | VOIDED`}</Code>
      <H>Fail-safe by construction</H>
      <p>
        Conflicting sources, missing corroboration or low confidence never guess: they resolve to{" "}
        <b className="text-slate-100">AMBIGUOUS_VOID</b>, and every bettor pulls a 100% principal refund. A market nobody resolves for 30
        days after its end can be voided by anyone.
      </p>
    </>
  );
}

function Slashing() {
  return (
    <>
      <H>Bond game</H>
      <p>
        The loser of a dispute loses their bond. Half goes to the party who was right, half to the protocol safety vault, so neither
        side can profit from a self-dealing dispute.
      </p>
      <Code>{`B_slashed        = B_loser
to winner        = ⌊B_loser / 2⌋
to safety vault  = B_loser − ⌊B_loser / 2⌋

proposer wrong  : B_loser = 0.1 GEN → 0.05 / 0.05
challenger wrong: B_loser = 0.2 GEN → 0.10 / 0.10`}</Code>
      <H>Payouts</H>
      <Code>{`fee          = ⌊pool · 1%⌋ → whoever was right
distributable = pool − fee
payout_i      = ⌊ stake_i · distributable / winning_pool ⌋
VOID          → payout_i = principal_i (no fee)`}</Code>
      <p>
        Rounding dust (less than one wei per winner) stays in the pool. Every wei is tracked by{" "}
        <code className="ticker text-amber-300">get_accounting</code>: pool + bonds + credits + vault = deposits − withdrawals.
      </p>
    </>
  );
}

function Consensus() {
  return (
    <>
      <H>Equivalence Principle</H>
      <p>
        Every validator independently fetches the same URLs and asks its own LLM for a <i>stance per source</i> (YES / NO / UNCLEAR with a
        verbatim quote). The contract then derives the verdict <b className="text-slate-100">deterministically</b> from those stances, so
        validators agree when their derived outcomes match — wording and reasoning may differ freely.
      </p>
      <Code>{`conflict (YES + NO)           → VOID
definitive < min(2, readable) → VOID
confidence < 60               → VOID
LLM verdict ≠ stance verdict  → VOID
otherwise                     → YES | NO`}</Code>
      <H>Escalation</H>
      <p>
        A contested verdict goes to a 7-juror panel, each applying a different judicial lens. Only a 5-of-7 supermajority yields a
        definitive verdict; anything weaker voids the market.
      </p>
      <H>Trust assumptions</H>
      <p>
        Sources are authorised by domain root at market creation (https only, no look-alike hosts). Validators and their LLMs are trusted
        to be mostly honest and live; a web page is only as truthful as its publisher.
      </p>
    </>
  );
}
