/**
 * Frontend trial-creation transaction path, end to end (offline).
 *
 * Exercises the SAME modules the "Create Prediction Trial" modal calls:
 *   validateTrialForm -> buildCreateTrialCall -> deriveFees -> sendWrite (genlayer-js writeContract over an
 *   EIP-1193 provider's eth_sendTransaction) -> waitForFinished (ACCEPTED/FINALIZED + FINISHED_WITH_RETURN)
 *   -> get_market readback -> loadCourt refresh.
 *
 * Only the network is stubbed: a fake Studio JSON-RPC (responses recorded from the live Studio Next node, see
 * ./fixtures) and an in-memory contract behind `reader.readContract`. genlayer-js itself runs for real, so the
 * transaction the provider receives is the one a wallet would be asked to sign. The live proof against Studio Next
 * itself is `npm run e2e:create-trial` (see deployments/verification.json).
 */
import { abi } from "genlayer-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import feeConfig from "./fixtures/sim_getFeeConfig.json";
import receiptFixture from "./fixtures/eth_getTransactionReceipt.json";
import { loadCourt } from "../api";
import { CHAIN_ID_HEX, CONTRACT_ADDRESS, chain, reader } from "../chain";
import {
  buildCreateTrialCall,
  createTrial,
  parseSources,
  slug,
  validateTrialForm,
  type TrialForm,
} from "../createTrial";
import {
  assertFinished,
  deriveFees,
  ensureChain,
  isTransient,
  receiptStatus,
  sendWrite,
  waitForFinished,
  type Eip1193,
} from "../txPath";
import type { Market } from "../types";

const WALLET = "0x00C60038c6be65500F51cf02967d28260Be2c27E" as const;
const NOW_MS = Date.UTC(2026, 9, 16, 12, 0, 0);
const CONSENSUS = chain.consensusMainContract?.address.toLowerCase();

/** `<input type="datetime-local">` value for an instant, in the machine's local zone (how the browser parses it back). */
const localInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const goodForm = (over: Partial<TrialForm> = {}): TrialForm => ({
  title: "Will the ECB cut rates at its next meeting?",
  spec: "Resolves YES only if the sources definitively show a cut. Otherwise AMBIGUOUS_VOID.",
  urlsText: "https://www.ecb.europa.eu/press/pr/date/\nhttps://www.reuters.com/markets/europe/",
  deadline: localInput(NOW_MS + 2 * 86400_000),
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------
// 1. form validation
// ---------------------------------------------------------------------------------------------------------------
describe("1. form validation", () => {
  const nowSec = Math.floor(NOW_MS / 1000);

  it("accepts a complete form", () => {
    expect(validateTrialForm(goodForm(), nowSec)).toBeNull();
  });

  it.each([
    ["empty title", { title: "  " }, "Enter the market question."],
    ["empty clause", { spec: "" }, "Enter a strict resolution clause."],
    ["no sources", { urlsText: "" }, "Provide 1–6 source URLs."],
    ["7 sources", { urlsText: Array.from({ length: 7 }, (_, i) => `https://s${i}.example.com/a`).join("\n") }, "Provide 1–6 source URLs."],
    ["http source", { urlsText: "http://insecure.example.com/x" }, "Every source must be a valid https:// URL."],
    ["garbage source", { urlsText: "https://" }, "Every source must be a valid https:// URL."],
    ["no deadline", { deadline: "" }, "Pick a resolution deadline in the future."],
    ["deadline within 60 s", { deadline: localInput(NOW_MS + 30_000) }, "Pick a resolution deadline in the future."],
    ["deadline in the past", { deadline: "2020-01-01T00:00" }, "Pick a resolution deadline in the future."],
  ])("rejects %s", (_name, over, message) => {
    expect(validateTrialForm(goodForm(over as Partial<TrialForm>), nowSec)).toBe(message);
  });

  it("derives de-duplicated domain roots without www.", () => {
    expect(parseSources("https://www.a.com/x https://a.com/y, https://b.org/z").hosts).toEqual(["a.com", "b.org"]);
  });

  it("builds the create_market call exactly as the contract expects it", () => {
    const call = buildCreateTrialCall(goodForm(), NOW_MS);
    expect(call.functionName).toBe("create_market");
    const [id, title, spec, whitelist, urls, endTs] = call.args;
    expect(id).toBe(call.marketId);
    expect(String(id).length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(title).toBe("Will the ECB cut rates at its next meeting?");
    expect(spec).toContain("AMBIGUOUS_VOID");
    expect(whitelist).toEqual(["ecb.europa.eu", "reuters.com"]);
    expect(urls).toEqual(["https://www.ecb.europa.eu/press/pr/date/", "https://www.reuters.com/markets/europe/"]);
    expect(endTs).toBe(Math.floor(new Date(goodForm().deadline).getTime() / 1000));
    expect(Number(endTs)).toBeGreaterThan(Math.floor(NOW_MS / 1000) + 86400);
  });

  it("slug is bounded to 64 chars and never empty", () => {
    expect(slug("?!?", NOW_MS)).toMatch(/^market-/);
    expect(slug("x".repeat(300), NOW_MS).length).toBeLessThanOrEqual(64);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Fake Studio Next node + EIP-1193 wallet
// ---------------------------------------------------------------------------------------------------------------
type Rpc = { method: string; params: unknown[] };
let rpcCalls: Rpc[] = [];
const SENT_HASH = "0x" + "ab".repeat(32);

function installFakeStudioRpc() {
  rpcCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const req = JSON.parse(init.body) as { id: number; method: string; params: unknown[] };
      rpcCalls.push({ method: req.method, params: req.params });
      const result = (() => {
        switch (req.method) {
          case "sim_getFeeConfig":
            return feeConfig;
          case "eth_getTransactionCount":
            return "0x0";
          case "eth_estimateGas":
            return "0x7a120";
          case "eth_gasPrice":
            return "0x0";
          case "eth_getTransactionReceipt":
            return {
              ...receiptFixture,
              transactionHash: req.params[0],
              blockHash: req.params[0],
              logs: [],
            };
          default:
            throw new Error(`unexpected RPC method in offline test: ${req.method}`);
        }
      })();
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { status: 200 });
    }),
  );
}

type FakeWallet = Eip1193 & { calls: Rpc[]; sent: Record<string, string>[]; failSend?: unknown };
function fakeWallet(opts: { onSend?: () => unknown } = {}): FakeWallet {
  const w: FakeWallet = {
    calls: [],
    sent: [],
    async request({ method, params = [] }) {
      w.calls.push({ method, params });
      switch (method) {
        case "wallet_switchEthereumChain":
          return null;
        case "eth_chainId":
          return CHAIN_ID_HEX.toLowerCase();
        case "eth_sendTransaction":
          if (opts.onSend) throw opts.onSend();
          w.sent.push(params[0] as Record<string, string>);
          return SENT_HASH;
        default:
          throw new Error(`wallet: unsupported ${method}`);
      }
    },
  };
  return w;
}

const decidedReceipt = (over: Record<string, unknown> = {}) => ({
  hash: SENT_HASH,
  status: 5,
  status_name: "ACCEPTED",
  txExecutionResult: 1,
  txExecutionResultName: "FINISHED_WITH_RETURN",
  result_name: "MAJORITY_AGREE",
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------
// 2. fee/gas configuration + EIP-1193 transaction construction
// ---------------------------------------------------------------------------------------------------------------
describe("2. fee derivation and transaction construction", () => {
  beforeEach(installFakeStudioRpc);
  afterEach(() => vi.unstubAllGlobals());

  it("derives a non-zero feeValue with a real distribution from the live fee policy (not a bare constant)", async () => {
    const { createClient } = await import("genlayer-js");
    const c = createClient({ chain, endpoint: "https://studio-next.genlayer.com/api", account: WALLET, provider: fakeWallet() as never });
    const fees = await deriveFees(c as never);
    expect(fees.feeValue).toBe(100000000000010352n); // 0.1 GEN + overlay/storage/receipt component from sim_getFeeConfig
    expect(fees.feeValue > 0n).toBe(true);
    const d = fees.distribution as Record<string, bigint | bigint[]>;
    expect(d.leaderTimeunitsAllocation).toBe(100n);
    expect(d.validatorTimeunitsAllocation).toBe(200n);
    expect(d.executionBudgetPerRound).toBe(25000000000000000n);
    expect(rpcCalls.map((r) => r.method)).toContain("sim_getFeeConfig");
  });

  it("refuses a zero feeValue (the FeeValueMustBeNonZero regression)", async () => {
    await expect(deriveFees({ estimateTransactionFees: async () => ({ distribution: {}, feeValue: 0n }) })).rejects.toThrow(/zero feeValue/);
  });

  it("ensureChain switches to chain 61997 (0xF22D) and adds the network on 4902", async () => {
    const calls: string[] = [];
    const p: Eip1193 = {
      async request({ method }) {
        calls.push(method);
        if (method === "wallet_switchEthereumChain") throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
        return null;
      },
    };
    await ensureChain(p);
    expect(calls).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain"]);
  });

  it("submits ONE eth_sendTransaction to the consensus contract carrying create_market calldata and the derived fee", async () => {
    const wallet = fakeWallet();
    const call = buildCreateTrialCall(goodForm(), NOW_MS);
    const hash = await sendWrite(wallet, WALLET, call.functionName, call.args);

    expect(hash).toBe(SENT_HASH);
    expect(wallet.calls.map((c) => c.method)).toEqual(["wallet_switchEthereumChain", "eth_sendTransaction"]);
    expect(wallet.calls[0].params).toEqual([{ chainId: "0xF22D" }]);
    expect(wallet.sent).toHaveLength(1);

    const tx = wallet.sent[0];
    expect(tx.from.toLowerCase()).toBe(WALLET.toLowerCase());
    expect(tx.to.toLowerCase()).toBe(CONSENSUS);
    expect(tx.data.slice(0, 10)).toBe("0x35a251fb"); // addTransaction((...fees...)) selector
    expect(BigInt(tx.value)).toBe(100000000000010352n); // user value 0 + derived feeValue, never 0
    expect(BigInt(tx.gas)).toBeGreaterThan(0n);

    // the GenLayer calldata for create_market(...) is embedded verbatim in the tx data
    const expected = abi.calldata.encode(abi.calldata.makeCalldataObject("create_market", call.args as never, undefined as never));
    const hex = Array.from(expected as Uint8Array, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(tx.data.toLowerCase()).toContain(hex);
    expect(tx.data.toLowerCase()).toContain(Array.from(new TextEncoder().encode(call.marketId), (b) => b.toString(16).padStart(2, "0")).join(""));
  });

  it("forwards the bond as user value on top of the fee for payable calls", async () => {
    const wallet = fakeWallet();
    await sendWrite(wallet, WALLET, "place_prediction", ["m1", 1], 50000000000000000n);
    expect(BigInt(wallet.sent[0].value)).toBe(50000000000000000n + 100000000000010352n);
  });

  it("surfaces a wallet rejection (EIP-1193 4001) to the caller", async () => {
    const wallet = fakeWallet({ onSend: () => Object.assign(new Error("User rejected the request."), { code: 4001 }) });
    await expect(sendWrite(wallet, WALLET, "create_market", ["x"])).rejects.toThrow(/User rejected/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. receipt polling and finality
// ---------------------------------------------------------------------------------------------------------------
describe("3. receipt polling and finality", () => {
  it("accepts ACCEPTED and FINALIZED with FINISHED_WITH_RETURN", () => {
    expect(() => assertFinished("0x1", decidedReceipt())).not.toThrow();
    expect(() => assertFinished("0x1", decidedReceipt({ status: 7, status_name: "FINALIZED" }))).not.toThrow();
    expect(() => assertFinished("0x1", { status: 5, txExecutionResultName: "FINISHED_WITH_RETURN" })).not.toThrow(); // numeric status only
  });

  it("reads status from status_name, statusName or the numeric code", () => {
    expect(receiptStatus({ status_name: "ACCEPTED" })).toBe("ACCEPTED");
    expect(receiptStatus({ statusName: "FINALIZED" })).toBe("FINALIZED");
    expect(receiptStatus({ status: "7" })).toBe("FINALIZED");
    expect(receiptStatus({})).toBeUndefined();
  });

  it("rejects an undecided status", () => {
    expect(() => assertFinished("0x1", decidedReceipt({ status: 1, status_name: "PENDING" }))).toThrow(/did not reach ACCEPTED\/FINALIZED/);
  });

  it("rejects a decided tx whose execution reverted (FINISHED_WITH_ERROR)", () => {
    expect(() => assertFinished("0x1", decidedReceipt({ txExecutionResultName: "FINISHED_WITH_ERROR" }))).toThrow(/not FINISHED_WITH_RETURN/);
  });

  it("polls until decided and returns the receipt", async () => {
    const wait = vi.fn().mockResolvedValue(decidedReceipt());
    const r = await waitForFinished({ waitForTransactionReceipt: wait }, SENT_HASH, { interval: 1 });
    expect(r.txExecutionResultName).toBe("FINISHED_WITH_RETURN");
    expect(wait).toHaveBeenCalledWith(expect.objectContaining({ hash: SENT_HASH, waitUntil: "decided" }));
  });

  it("rides out public-RPC rate limits / timeouts while polling", async () => {
    const wait = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit exceeded: 30 requests per minute"))
      .mockRejectedValueOnce(new Error("Timed out waiting for transaction 0x1 to reach \"decided\" (current status: 0)"))
      .mockResolvedValue(decidedReceipt({ status: 7, status_name: "FINALIZED" }));
    const r = await waitForFinished({ waitForTransactionReceipt: wait }, SENT_HASH, { interval: 1 });
    expect(receiptStatus(r)).toBe("FINALIZED");
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it("does not retry a genuine execution failure", async () => {
    const wait = vi.fn().mockResolvedValue(decidedReceipt({ txExecutionResultName: "FINISHED_WITH_ERROR" }));
    await expect(waitForFinished({ waitForTransactionReceipt: wait }, SENT_HASH, { interval: 1 })).rejects.toThrow(/FINISHED_WITH_ERROR/);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("classifies transient vs fatal errors", () => {
    expect(isTransient(new Error("Failed to fetch"))).toBe(true);
    expect(isTransient(new Error("Server busy: all 8 execution slots occupied"))).toBe(true);
    expect(isTransient(new Error("User rejected the request."))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 4. whole flow: validation -> wallet tx -> finality -> readback -> state refresh
// ---------------------------------------------------------------------------------------------------------------
function marketFrom(args: unknown[]): Market {
  const [market_id, title, criteria_spec, source_whitelist, source_urls, end_timestamp] = args as [
    string, string, string, string[], string[], number,
  ];
  return {
    market_id, title, criteria_spec, source_whitelist, source_urls, end_timestamp,
    creator: WALLET.toLowerCase(), created_at: Math.floor(NOW_MS / 1000), status: 0, status_name: "OPEN",
    proposed_outcome: 0, proposed_outcome_name: "UNRESOLVED", tentative_resolver: "", resolution_bond: 0,
    challenge_deadline: 0, dispute_challenger: "", challenge_bond: 0, final_verdict: 0, final_verdict_name: "UNRESOLVED",
    evidence_summary: "", telemetry: [], yes_pool: 0, no_pool: 0, fee_amount: 0, distributable: 0, claimed_total: 0,
    resolved_at: 0, challenge_window: 86400,
  } as Market;
}

describe("4. full creation flow", () => {
  let markets: Market[];
  beforeEach(() => {
    installFakeStudioRpc();
    markets = [marketFrom(["seed-1", "Seeded market", "clause", ["a.com"], ["https://a.com/x"], 1893456000])];
    // in-memory contract behind the real `reader` the app uses for every read
    vi.spyOn(reader, "readContract").mockImplementation((async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      switch (functionName) {
        case "get_market_count": return markets.length;
        case "get_market_id_at": return markets[Number(args[0])].market_id;
        case "get_market": {
          const m = markets.find((x) => x.market_id === args[0]);
          if (!m) throw new Error("market not found");
          return m;
        }
        case "get_accounting":
          return { total_in: 0, total_out: 0, pool_held: 0, locked_bonds: 0, credits_total: 0, vault: 0, invariant_ok: true };
        default: throw new Error(`unexpected read ${functionName}`);
      }
    }) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a trial through the wallet path, confirms finality, reads it back and refreshes the court", async () => {
    const before = await loadCourt();
    expect(before.markets.map((m) => m.market_id)).toEqual(["seed-1"]);

    const wallet = fakeWallet();
    const phases: string[] = [];
    let writtenArgs: unknown[] = [];
    const wait = vi
      .fn()
      .mockRejectedValueOnce(new Error("Timed out waiting for transaction")) // still PENDING on the first poll window
      .mockResolvedValue(decidedReceipt());

    const result = await createTrial({
      form: goodForm(),
      contract: CONTRACT_ADDRESS,
      nowMs: NOW_MS,
      poll: { interval: 1 },
      chainReader: { waitForTransactionReceipt: wait, readContract: reader.readContract as never },
      onPhase: (p) => phases.push(p),
      send: async (fn, args, value) => {
        writtenArgs = args;
        // consensus accepts the tx -> the contract now holds the new trial
        const hash = await sendWrite(wallet, WALLET, fn, args, value);
        markets.push(marketFrom(args));
        return hash;
      },
    });

    // ordering of the user-visible phases
    expect(phases).toEqual(["validating", "submitting", "confirming", "reading"]);
    // wallet saw exactly the eth_sendTransaction the contract call needs
    expect(wallet.sent).toHaveLength(1);
    expect(BigInt(wallet.sent[0].value)).toBeGreaterThan(0n);
    // finality gate passed
    expect(result.hash).toBe(SENT_HASH);
    expect(receiptStatus(result.receipt)).toBe("ACCEPTED");
    expect(result.receipt.txExecutionResultName).toBe("FINISHED_WITH_RETURN");
    // readback matches what was written
    expect(result.marketId).toBe(writtenArgs[0]);
    expect(result.trial.market_id).toBe(result.marketId);
    expect(result.trial.title).toBe(goodForm().title);
    expect(result.trial.status_name).toBe("OPEN");
    expect(result.trial.source_whitelist).toEqual(["ecb.europa.eu", "reuters.com"]);
    expect(result.count).toBe(2);

    // post-creation state refresh: the docket now lists the new trial
    const after = await loadCourt();
    expect(after.markets.map((m) => m.market_id)).toEqual(["seed-1", result.marketId]);
  });

  it("does not touch the wallet when the form is invalid", async () => {
    const wallet = fakeWallet();
    await expect(
      createTrial({
        form: goodForm({ title: "" }),
        contract: CONTRACT_ADDRESS,
        nowMs: NOW_MS,
        send: (fn, args, value) => sendWrite(wallet, WALLET, fn, args, value),
      }),
    ).rejects.toThrow("Enter the market question.");
    expect(wallet.calls).toHaveLength(0);
  });

  it("fails loudly when consensus decides but execution reverted", async () => {
    const wallet = fakeWallet();
    await expect(
      createTrial({
        form: goodForm(),
        contract: CONTRACT_ADDRESS,
        nowMs: NOW_MS,
        poll: { interval: 1 },
        chainReader: {
          waitForTransactionReceipt: async () => decidedReceipt({ txExecutionResultName: "FINISHED_WITH_ERROR" }),
          readContract: reader.readContract as never,
        },
        send: (fn, args, value) => sendWrite(wallet, WALLET, fn, args, value),
      }),
    ).rejects.toThrow(/not FINISHED_WITH_RETURN/);
  });

  it("fails if the trial is not readable on-chain after a 'successful' receipt", async () => {
    const wallet = fakeWallet();
    await expect(
      createTrial({
        form: goodForm(),
        contract: CONTRACT_ADDRESS,
        nowMs: NOW_MS,
        poll: { interval: 1 },
        chainReader: {
          waitForTransactionReceipt: async () => decidedReceipt(),
          readContract: (async () => markets[0]) as never, // returns some other market
        },
        send: (fn, args, value) => sendWrite(wallet, WALLET, fn, args, value),
      }),
    ).rejects.toThrow(/not found on-chain/);
  });
});
