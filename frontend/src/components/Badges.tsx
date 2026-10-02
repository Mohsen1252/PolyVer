import { Ban, CheckCircle2, Clock, Gavel, Hourglass, ShieldAlert } from "lucide-react";
import type { StatusName } from "../types";
import { domainOf } from "../lib";

type Look = { cls: string; glow: string; icon: typeof Gavel; label: string };

const LOOK: Record<string, Look> = {
  OPEN: { cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300", glow: "", icon: Clock, label: "OPEN" },
  TENTATIVE_RESOLVED: { cls: "border-yellow-400/60 bg-yellow-400/10 text-yellow-300", glow: "glow-tentative", icon: Gavel, label: "TENTATIVE" },
  DISPUTED: { cls: "border-orange-500/60 bg-orange-500/10 text-orange-300", glow: "glow-disputed", icon: ShieldAlert, label: "DISPUTED · APPEAL" },
  RESOLVED_YES: { cls: "border-cyan-400/60 bg-cyan-400/10 text-cyan-300", glow: "glow-finalized", icon: CheckCircle2, label: "RESOLVED · YES" },
  RESOLVED_NO: { cls: "border-purple-400/60 bg-purple-400/10 text-purple-300", glow: "glow-finalized", icon: CheckCircle2, label: "RESOLVED · NO" },
  VOIDED: { cls: "border-slate-500/50 bg-slate-500/10 text-slate-300", glow: "", icon: Ban, label: "VOIDED" },
  RESOLVING: { cls: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300", glow: "", icon: Hourglass, label: "RESOLVING" },
};

export function statusKey(status: StatusName, finalVerdict = 0): string {
  if (status === "FINALIZED") return finalVerdict === 2 ? "RESOLVED_NO" : "RESOLVED_YES";
  return status;
}

export function StatusBadge({ status, finalVerdict = 0 }: { status: StatusName; finalVerdict?: number }) {
  const s = LOOK[statusKey(status, finalVerdict)] ?? LOOK.OPEN;
  const Icon = s.icon;
  return (
    <span
      className={`ticker inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wider ${s.cls} ${s.glow}`}
    >
      <Icon size={12} aria-hidden /> {s.label}
    </span>
  );
}

export function SourceBadge({ domain }: { domain: string }) {
  return (
    <span className="ticker inline-flex items-center rounded border border-slate-700 bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-slate-400">
      {domainOf(domain)}
    </span>
  );
}

const STANCE: Record<string, string> = {
  YES: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  NO: "border-rose-500/50 bg-rose-500/10 text-rose-300",
  VOID: "border-slate-500/50 bg-slate-500/10 text-slate-300",
  UNCLEAR: "border-slate-600/60 bg-slate-600/10 text-slate-400",
};

export function Chip({ kind, children }: { kind: keyof typeof STANCE | string; children?: React.ReactNode }) {
  return (
    <span
      className={`ticker inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STANCE[kind] ?? STANCE.UNCLEAR}`}
    >
      {children ?? kind}
    </span>
  );
}
