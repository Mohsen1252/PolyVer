import { Ban, CheckCircle2, Clock, Gavel, Hourglass, ShieldAlert } from "lucide-react";
import type { StatusName } from "../types";
import { STATUS_LABEL, domainOf } from "../lib";

const STYLE: Record<StatusName, { cls: string; glow: string; icon: typeof Gavel }> = {
  OPEN: { cls: "border-sky-500/40 bg-sky-500/10 text-sky-300", glow: "", icon: Clock },
  RESOLVING: { cls: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300", glow: "", icon: Hourglass },
  TENTATIVE_RESOLVED: {
    cls: "border-amber-500/60 bg-amber-500/10 text-amber-300",
    glow: "glow-tentative",
    icon: Gavel,
  },
  DISPUTED: { cls: "border-rose-500/60 bg-rose-500/10 text-rose-300", glow: "glow-disputed", icon: ShieldAlert },
  FINALIZED: {
    cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    glow: "glow-finalized",
    icon: CheckCircle2,
  },
  VOIDED: { cls: "border-slate-500/50 bg-slate-500/10 text-slate-300", glow: "", icon: Ban },
};

export function StatusBadge({ status }: { status: StatusName }) {
  const s = STYLE[status];
  const Icon = s.icon;
  return (
    <span
      className={`ticker inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wider ${s.cls} ${s.glow}`}
    >
      <Icon size={12} aria-hidden /> {STATUS_LABEL[status]}
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
