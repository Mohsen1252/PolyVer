import { useState } from "react";
import { AlertTriangle, Gavel, Loader2, Scale, Swords } from "lucide-react";
import { BOND_CHALLENGE, BOND_RESOLVE, txUrl } from "../chain";
import { fmtDuration, fmtGen, useNow } from "../lib";
import type { Market } from "../types";
import type { Wallet } from "../wallet";

type Props = { market: Market; wallet: Wallet; onDone: () => void; compact?: boolean };

export function ChallengeCountdown({ market, wallet, onDone, compact }: Props) {
  const now = useNow();
  const remaining = market.challenge_deadline - now;
  const open = remaining > 0;
  const total = market.challenge_window || 86400;
  const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
  const run = useAction(wallet, onDone);

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex flex-nowrap items-center justify-between gap-3 whitespace-nowrap">
        <span className="ticker text-[10px] uppercase tracking-widest text-amber-300/80">
          {open ? "Challenge window closes in" : "Challenge window closed"}
        </span>
        <span className={`ticker font-semibold text-amber-300 ${compact ? "text-lg" : "text-2xl"}`}>
          {open ? fmtDuration(remaining) : "00:00:00"}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-gavel transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3">
        {open ? (
          <button
            onClick={() => run.go("challenge_verdict", [market.market_id], BOND_CHALLENGE)}
            disabled={run.busy}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-60"
          >
            {run.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Swords size={14} aria-hidden />}
            File Dispute / Challenge Verdict · {fmtGen(BOND_CHALLENGE)} GEN bond
          </button>
        ) : (
          <button
            onClick={() => run.go("finalize_resolution", [market.market_id])}
            disabled={run.busy}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {run.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Gavel size={14} aria-hidden />}
            Finalize uncontested verdict
          </button>
        )}
        <ActionStatus run={run} />
      </div>
    </div>
  );
}

export function ActionPanel({ market, wallet, onDone }: Props) {
  const now = useNow();
  const run = useAction(wallet, onDone);
  const [amount, setAmount] = useState("0.05");

  if (market.status_name === "TENTATIVE_RESOLVED") {
    return <ChallengeCountdown market={market} wallet={wallet} onDone={onDone} />;
  }

  if (market.status_name === "DISPUTED") {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
        <p className="text-sm text-rose-200">
          Verdict contested. Convene the 7-juror Supreme Court round (5-of-7 supermajority required).
        </p>
        <button
          onClick={() => run.go("resolve_disputed_market", [market.market_id])}
          disabled={run.busy}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-rose-500/60 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-60"
        >
          {run.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Scale size={14} aria-hidden />}
          Convene Jury
        </button>
        <ActionStatus run={run} />
      </div>
    );
  }

  if (market.status_name === "OPEN") {
    const ended = now >= market.end_timestamp;
    if (ended) {
      return (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
          <p className="text-sm text-indigo-200">
            Betting closed. Post a {fmtGen(BOND_RESOLVE)} GEN bond to open steward deliberation: validators
            scrape the whitelisted sources and reach consensus.
          </p>
          <button
            onClick={() => run.go("propose_resolution", [market.market_id], BOND_RESOLVE)}
            disabled={run.busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-verdict px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            {run.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Gavel size={14} aria-hidden />}
            Propose Resolution · {fmtGen(BOND_RESOLVE)} GEN bond
          </button>
          <ActionStatus run={run} />
        </div>
      );
    }
    const wei = parseGen(amount);
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <label className="ticker text-[10px] uppercase tracking-widest text-slate-500" htmlFor={`amt-${market.market_id}`}>
          Stake (GEN)
        </label>
        <input
          id={`amt-${market.market_id}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="ticker mt-1 w-full rounded-md border border-slate-700 bg-[#08090d] px-3 py-2 text-sm text-slate-100 outline-none focus:border-verdict"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["YES", "NO"] as const).map((side) => (
            <button
              key={side}
              disabled={run.busy || wei === null}
              onClick={() => wei !== null && run.go("place_prediction", [market.market_id, side === "YES" ? 1 : 2], wei)}
              className={`ticker rounded-md border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                side === "YES"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
              }`}
            >
              Bet {side}
            </button>
          ))}
        </div>
        <ActionStatus run={run} />
      </div>
    );
  }

  if (market.status_name === "FINALIZED" || market.status_name === "VOIDED") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <p className="text-sm text-slate-300">
          {market.status_name === "VOIDED"
            ? "Ambiguous verdict — every bettor can pull a 100% principal refund."
            : "Settled — winners pull pro-rata payouts."}
        </p>
        <button
          onClick={() => run.go("claim_payout", [market.market_id])}
          disabled={run.busy}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {run.busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
          Claim payout
        </button>
        <ActionStatus run={run} />
      </div>
    );
  }
  return null;
}

function parseGen(v: string): bigint | null {
  if (!/^\d+(\.\d{1,18})?$/.test(v.trim())) return null;
  const [w, f = ""] = v.trim().split(".");
  const wei = BigInt(w) * 10n ** 18n + BigInt(f.padEnd(18, "0"));
  return wei > 0n ? wei : null;
}

type Run = ReturnType<typeof useAction>;

function useAction(wallet: Wallet, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return {
    busy,
    hash,
    err,
    async go(fn: string, args: (string | number)[], value = 0n) {
      setErr(null);
      setHash(null);
      if (!wallet.address) {
        await wallet.connect();
        return;
      }
      try {
        setBusy(true);
        const h = await wallet.send(fn, args, value);
        setHash(h);
        setTimeout(onDone, 4000);
      } catch (e) {
        setErr((e as Error).message?.split("\n")[0] ?? String(e));
      } finally {
        setBusy(false);
      }
    },
  };
}

function ActionStatus({ run }: { run: Run }) {
  if (run.err)
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {run.err}
      </p>
    );
  if (run.hash)
    return (
      <p className="ticker mt-2 break-all text-xs text-emerald-300">
        Submitted:{" "}
        <a className="underline" href={txUrl(run.hash)} target="_blank" rel="noreferrer">
          {run.hash.slice(0, 18)}…
        </a>
      </p>
    );
  return null;
}
