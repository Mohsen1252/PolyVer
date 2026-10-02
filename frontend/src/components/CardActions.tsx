import { useState } from "react";
import { Coins, Gavel, Loader2, Swords } from "lucide-react";
import { BOND_CHALLENGE, BOND_RESOLVE, CHAIN_ID } from "../chain";
import { fmtGen, useNow } from "../lib";
import type { Market } from "../types";
import type { Wallet } from "../wallet";
import { ActionStatus, parseGen, useAction } from "./ActionPanel";

const CONNECT_TIP = `Connect MetaMask on Studio Next (chain ${CHAIN_ID}) to use this action`;

function Btn({
  label,
  icon,
  tone,
  disabled,
  title,
  busy,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  tone: "emerald" | "indigo" | "orange";
  disabled?: boolean;
  title?: string;
  busy?: boolean;
  onClick: () => void;
}) {
  const tones = {
    emerald: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
    indigo: "border-indigo-500/60 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25",
    orange: "border-orange-500/60 bg-orange-500/15 text-orange-100 hover:bg-orange-500/25",
  }[tone];
  return (
    <span title={title} className="block">
      <button
        onClick={onClick}
        disabled={disabled || busy}
        aria-disabled={disabled}
        className={`inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${tones}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : icon}
        {label}
      </button>
    </span>
  );
}

export function CardActions({ market: m, wallet, onDone }: { market: Market; wallet: Wallet; onDone: () => void }) {
  const now = useNow();
  const run = useAction(wallet, onDone);
  const [staking, setStaking] = useState(false);
  const [amount, setAmount] = useState("0.05");
  const connected = !!wallet.address;
  const tip = connected ? undefined : CONNECT_TIP;

  const open = m.status_name === "OPEN";
  const betting = open && now < m.end_timestamp;
  const canPropose = open && now >= m.end_timestamp;
  const canChallenge = m.status_name === "TENTATIVE_RESOLVED" && now < m.challenge_deadline;
  const wei = parseGen(amount);

  return (
    <div className="mt-4 space-y-2">
      <div className="grid gap-2 sm:grid-cols-1">
        <Btn
          label="Place Stake"
          icon={<Coins size={14} aria-hidden />}
          tone="emerald"
          disabled={!connected || !betting}
          title={tip ?? (betting ? undefined : "Betting is closed for this market")}
          onClick={() => setStaking((v) => !v)}
        />
        <Btn
          label={`Propose Verdict · ${fmtGen(BOND_RESOLVE)} GEN bond`}
          icon={<Gavel size={14} aria-hidden />}
          tone="indigo"
          disabled={!connected || !canPropose}
          busy={run.busy}
          title={tip ?? (canPropose ? undefined : "Available once betting has ended and no verdict exists")}
          onClick={() => run.go("propose_resolution", [m.market_id], BOND_RESOLVE)}
        />
        <Btn
          label={`Challenge Verdict · ${fmtGen(BOND_CHALLENGE)} GEN bond`}
          icon={<Swords size={14} aria-hidden />}
          tone="orange"
          disabled={!connected || !canChallenge}
          busy={run.busy}
          title={tip ?? (canChallenge ? undefined : "Only a tentative verdict inside its 24h window can be challenged")}
          onClick={() => run.go("challenge_verdict", [m.market_id], BOND_CHALLENGE)}
        />
      </div>
      {!connected && (
        <p className="ticker text-[10px] leading-snug text-slate-500">
          Wallet not connected — connect MetaMask on Studio Next (chain {CHAIN_ID}) to enable actions.
        </p>
      )}
      {staking && connected && betting && (
        <div className="rounded-md border border-slate-800 bg-[#08090d] p-3">
          <label className="ticker text-[10px] uppercase tracking-widest text-slate-500" htmlFor={`stake-${m.market_id}`}>
            Stake (GEN)
          </label>
          <input
            id={`stake-${m.market_id}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="ticker mt-1 w-full rounded border border-slate-700 bg-[#0d0f16] px-2.5 py-1.5 text-sm outline-none focus:border-verdict"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([1, 2] as const).map((side) => (
              <button
                key={side}
                disabled={run.busy || wei === null}
                onClick={() => wei !== null && run.go("place_prediction", [m.market_id, side], wei)}
                className={`ticker rounded border px-2 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  side === 1 ? "border-emerald-500/50 text-emerald-300" : "border-rose-500/50 text-rose-300"
                }`}
              >
                Stake {side === 1 ? "YES" : "NO"}
              </button>
            ))}
          </div>
        </div>
      )}
      <ActionStatus run={run} />
    </div>
  );
}
