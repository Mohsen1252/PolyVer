export type Telemetry = {
  url: string;
  status: number;
  ok: boolean;
  headline?: string;
  excerpt?: string;
  stance?: "YES" | "NO" | "UNCLEAR";
  quote?: string;
};

export type Market = {
  market_id: string;
  title: string;
  criteria_spec: string;
  source_whitelist: string[];
  source_urls: string[];
  creator: string;
  end_timestamp: number;
  created_at: number;
  status: number;
  status_name: StatusName;
  proposed_outcome: number;
  proposed_outcome_name: string;
  tentative_resolver: string;
  resolution_bond: number | string;
  challenge_deadline: number;
  dispute_challenger: string;
  challenge_bond: number | string;
  final_verdict: number;
  final_verdict_name: string;
  evidence_summary: string;
  telemetry: Telemetry[];
  yes_pool: number | string;
  no_pool: number | string;
  fee_amount: number | string;
  distributable: number | string;
  claimed_total: number | string;
  resolved_at: number;
  challenge_window: number;
};

export type StatusName =
  | "OPEN"
  | "RESOLVING"
  | "TENTATIVE_RESOLVED"
  | "DISPUTED"
  | "FINALIZED"
  | "VOIDED";

export type Ballot = { id: number; lens: string; vote: "YES" | "NO" | "VOID"; reason: string };

export type Jury = {
  convened: boolean;
  jury_size: number;
  quorum: number;
  outcome?: number;
  outcome_name?: string;
  yes?: number;
  no?: number;
  void?: number;
  agreement_pct?: number;
  ballots?: Ballot[];
  final_verdict_name?: string;
};

export type Accounting = {
  total_in: number | string;
  total_out: number | string;
  pool_held: number | string;
  locked_bonds: number | string;
  credits_total: number | string;
  vault: number | string;
  invariant_ok: boolean;
};

export type TxRecord = {
  label: string;
  market_id?: string;
  fn: string;
  hash: string;
  url: string;
  status?: string;
  result_name?: string;
  votes?: Record<string, string>;
  agree?: number;
  total?: number;
  note?: string;
};

export type CourtData = {
  markets: Market[];
  juries: Record<string, Jury>;
  accounting: Accounting;
  loadedAt: number;
};
