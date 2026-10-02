"""Live interaction with the deployed PolyVerdict contract on Studio Next.

    .venv/bin/python scripts/interact_live.py seed        # create + bet + resolve the court cases
    .venv/bin/python scripts/interact_live.py status      # print every market
    .venv/bin/python scripts/interact_live.py propose <id>
    .venv/bin/python scripts/interact_live.py challenge <id>      # second account, 0.2 GEN bond
    .venv/bin/python scripts/interact_live.py jury <id>           # convene the 7-juror round
    .venv/bin/python scripts/interact_live.py finalize            # finalize every market past its window
    .venv/bin/python scripts/interact_live.py claim               # pull payouts + credits for both accounts

Every transaction is appended (hash, consensus result, per-validator votes) to
deployments/studio-next.json so README.md and the frontend can cite it.
"""

import json
import os
import stat
import sys
import time

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
import _common as c  # noqa: E402
from eth_account import Account  # noqa: E402
from genlayer_py.exceptions import GenLayerError  # noqa: E402

RES_BOND = 10**17
CHAL_BOND = 2 * 10**17
STAKE_YES = 5 * 10**16  # 0.05 GEN
STAKE_NO = 3 * 10**16  # 0.03 GEN
BETTING_WINDOW = 600  # seconds between market creation and end_timestamp

CASES = [
    {
        "key": "case-1",
        "id": "starship-flight-8",
        "title": "Has SpaceX Starship completed Orbital Test Flight 8?",
        "spec": "Resolves YES if the sources report that Starship Flight Test 8 (Flight 8) took place, i.e. the "
                "Starship stack lifted off from Starbase, Texas and flew its test flight. Resolves NO if the "
                "sources show the flight did not take place. If sources conflict or do not definitively settle "
                "it, the market is AMBIGUOUS_VOID.",
        "whitelist": ["wikipedia.org", "spacex.com"],
        "urls": ["https://en.wikipedia.org/wiki/Starship_flight_test_8",
                 "https://en.wikipedia.org/wiki/SpaceX_Starship_flight_tests"],
        "resolve": True,
    },
    {
        "key": "case-2a",
        "id": "fed-100bps-sep-2026",
        "title": "Did the US Federal Reserve cut rates by 100bps in Sep 2026?",
        "spec": "Resolves YES only if the sources definitively show the FOMC lowered the federal funds target range "
                "by 100 basis points (1.00 percentage point) at its September 2026 meeting. Resolves NO if the "
                "sources show a smaller cut, no change or a hike at that meeting. Otherwise AMBIGUOUS_VOID.",
        "whitelist": ["federalreserve.gov", "wikipedia.org"],
        "urls": ["https://www.federalreserve.gov/monetarypolicy/openmarket.htm",
                 "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
                 "https://en.wikipedia.org/wiki/Federal_funds_rate"],
        "resolve": True,
    },
    {
        # Second attempt at Case #2 with the Fed's own primary documents. The first attempt (case-2a)
        # cited index/calendar pages that never state the decision, so validators correctly failed safe.
        "key": "case-2b",
        "id": "fed-100bps-sep-2026-primary",
        "title": "Did the US Federal Reserve cut rates by 100bps in Sep 2026? (primary sources)",
        "spec": "Before the September 2026 FOMC meeting the target range was 3-1/2 to 3-3/4 percent (July 29 "
                "statement). Resolves YES only if the sources show the FOMC lowered the target range by 100 basis "
                "points at its September 15-16 2026 meeting (to 2-1/2 to 2-3/4 percent). Resolves NO if the sources "
                "show it raised, held, or cut by less than 100 basis points. Otherwise AMBIGUOUS_VOID.",
        "whitelist": ["federalreserve.gov"],
        "urls": ["https://www.federalreserve.gov/newsevents/pressreleases/monetary20260729a.htm",
                 "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm",
                 "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a1.htm"],
        "resolve": True,
    },
    {
        "key": "case-3",
        "id": "country-x-treaty-y-q3",
        "title": "Did Country X sign Treaty Y by Q3?",
        "spec": "Resolves YES only if at least two whitelisted sources definitively confirm that Country X signed "
                "Treaty Y on or before 30 September. Resolves NO only if they definitively deny it. Conflicting or "
                "non-confirming media reports resolve AMBIGUOUS_VOID and refund all principal.",
        "whitelist": ["apnews.com", "bbc.com", "reuters.com"],
        "urls": ["https://apnews.com/hub/world-news", "https://www.bbc.com/news/world",
                 "https://www.reuters.com/world/"],
        "resolve": True,
    },
    {
        "key": "case-4",
        "id": "boe-cut-sep-2026",
        "title": "Did the Bank of England cut Bank Rate at its September 2026 meeting?",
        "spec": "Resolves YES if the sources definitively show the Monetary Policy Committee lowered Bank Rate at "
                "its September 2026 meeting, NO if it held or raised. Otherwise AMBIGUOUS_VOID. Pending trial: "
                "ready for steward deliberation.",
        "whitelist": ["bankofengland.co.uk", "bbc.com"],
        "urls": ["https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
                 "https://www.bbc.com/news/business"],
        "resolve": False,
    },
    {
        # Not one of the four spec'd cases: a dedicated market that exercises the challenge game
        # live (challenge -> 7-juror round -> bond slashing) without disturbing Cases #1-#4.
        "key": "case-5",
        "id": "starship-flight-8-appeal",
        "title": "Appeal demo: did Starship Flight 8 take place? (challenge game)",
        "spec": "Resolves YES if the sources report that Starship Flight Test 8 took place, i.e. the Starship "
                "stack lifted off from Starbase, Texas. Resolves NO if the sources show it did not. If sources "
                "conflict or do not definitively settle it, AMBIGUOUS_VOID. This market is deliberately "
                "challenged to exercise the dispute game.",
        "whitelist": ["wikipedia.org"],
        "urls": ["https://en.wikipedia.org/wiki/Starship_flight_test_8",
                 "https://en.wikipedia.org/wiki/SpaceX_Starship_flight_tests"],
        "resolve": True,
        "dispute": True,
    },
]


# ----------------------------------------------------------------- plumbing
def second_account():
    """A second local key (bettor / challenger) so the court has a real counterparty."""
    c.ensure_key()
    key = os.environ.get("POLYVERDICT_SECOND_KEY")
    if not key:
        acct = Account.create()
        key = "0x" + acct.key.hex().removeprefix("0x")
        with open(c.ENV_PATH, "a") as f:
            f.write(f"POLYVERDICT_SECOND_KEY={key}\n")
        os.chmod(c.ENV_PATH, stat.S_IRUSR | stat.S_IWUSR)
        os.environ["POLYVERDICT_SECOND_KEY"] = key
    return Account.from_key(key)


def busy_retry(fn, attempts=12):
    """The shared testnet RPC answers 'Server busy: all N execution slots occupied' under load."""
    for i in range(attempts):
        try:
            return fn()
        except GenLayerError as e:
            msg = str(e).lower()
            retryable = "busy" in msg or "slots" in msg or "rate limit" in msg
            if not retryable or i == attempts - 1:
                raise
            time.sleep(20 if "rate limit" in msg else 5 * (i + 1))


def receipt_retry(fn, attempts=20):
    """Survive gateway blips (HTML 502 pages, resets) while polling for a decided transaction."""
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - network layer raises several unrelated types
            if i == attempts - 1:
                raise
            print(f"    receipt poll error ({type(e).__name__}); retry {i + 1}", flush=True)
            time.sleep(6)


class Court:
    def __init__(self):
        self.dep = c.load_deployment()
        self.addr = self.dep["contract_address"]
        self.a = c.account()
        self.b = second_account()
        c.ensure_funded(self.a.address)
        c.ensure_funded(self.b.address, minimum_gen=2.0)
        self.client = c.make_client(self.a)
        self._ids = None

    def read(self, fn, args=None, acct=None):
        return busy_retry(lambda: self.client.read_contract(
            address=self.addr, function_name=fn, args=args or [], account=acct or self.a))

    def market(self, mid):
        return self.read("get_market", [mid])

    def exists(self, mid):
        # Contract reverts surface as a generic "execution failed", so enumerate ids instead.
        # The public RPC allows ~30 requests/minute, so the id list is read once and cached.
        if self._ids is None:
            self._ids = [self.read("get_market_id_at", [i]) for i in range(self.read("get_market_count"))]
        return mid in self._ids

    def send(self, acct, fn, args, value=0, label=None, market_id=None, retries=240):
        h = busy_retry(lambda: self.client.write_contract(
            address=self.addr, function_name=fn, account=acct, args=args, value=value, fees=c.fees(self.client)))
        print(f"  tx {fn}{args if fn != 'create_market' else [args[0]]} -> {h}", flush=True)
        r = receipt_retry(lambda: self.client.wait_for_transaction_receipt(
            transaction_hash=h, retries=retries // 2, interval=6000))
        votes = (r.get("consensus_data") or {}).get("votes") or {}
        rec = {
            "label": label or fn,
            "market_id": market_id or (args[0] if args and isinstance(args[0], str) else None),
            "fn": fn,
            "sender": acct.address,
            "value_wei": value,
            "hash": h,
            "url": c.tx_url(h),
            "status": (r.get("lifecycle") or {}).get("state"),
            "result_name": r.get("result_name"),
            "exec": r.get("txExecutionResultName"),
            "votes": votes,
            "agree": sum(1 for v in votes.values() if v == "agree"),
            "total": len(votes),
        }
        self.dep.setdefault("transactions", []).append(rec)
        c.save_deployment(self.dep)
        print(f"    {rec['exec']} / {rec['result_name']} / votes {rec['agree']}/{rec['total']} agree", flush=True)
        if rec["exec"] != "FINISHED_WITH_RETURN":
            raise RuntimeError(f"{fn} did not finish with a return: {rec['exec']} ({json.dumps(r.get('result'))[:300]})")
        return rec

    def summary(self, m):
        return (f"{m['market_id']:<24} {m['status_name']:<19} proposed={m['proposed_outcome_name']:<14} "
                f"final={m['final_verdict_name']:<14} yes={m['yes_pool'] / c.GEN:.3f} no={m['no_pool'] / c.GEN:.3f}")


# ----------------------------------------------------------------- commands
def cmd_seed(ct: Court):
    end = c.chain_now() + BETTING_WINDOW
    for case in CASES:
        if ct.exists(case["id"]):
            print(f"{case['id']}: already created")
        else:
            print(f"create {case['id']}")
            ct.send(ct.a, "create_market", [case["id"], case["title"], case["spec"], case["whitelist"],
                                            case["urls"], end], label=f"{case['key']}: create market")
            ct._ids.append(case["id"])
        ct.dep.setdefault("cases", {})[case["key"]] = {"market_id": case["id"], "title": case["title"]}
        c.save_deployment(ct.dep)
    for case in CASES:
        m = ct.market(case["id"])
        if int(m["yes_pool"]) == 0:
            ct.send(ct.a, "place_prediction", [case["id"], 1], value=STAKE_YES, label=f"{case['key']}: bet YES")
        if int(m["no_pool"]) == 0:
            ct.send(ct.b, "place_prediction", [case["id"], 2], value=STAKE_NO, label=f"{case['key']}: bet NO")
    deadline = max(ct.market(cs["id"])["end_timestamp"] for cs in CASES)
    print(f"waiting for end_timestamp {deadline} (+margin) ...", flush=True)
    c.wait_for_chain_time(deadline)
    for case in CASES:
        m = ct.market(case["id"])
        if case["resolve"] and m["status_name"] == "OPEN":
            print(f"propose {case['id']}")
            ct.send(ct.a, "propose_resolution", [case["id"]], value=RES_BOND,
                    label=f"{case['key']}: propose resolution")
        print(ct.summary(ct.market(case["id"])))
    for case in CASES:
        if case.get("dispute") and ct.market(case["id"])["status_name"] == "TENTATIVE_RESOLVED":
            print(f"challenge {case['id']} (second account, 0.2 GEN bond)")
            cmd_challenge(ct, case["id"])
        if case.get("dispute") and ct.market(case["id"])["status_name"] == "DISPUTED":
            print(f"convene jury {case['id']}")
            cmd_jury(ct, case["id"])


def cmd_status(ct: Court):
    for i in range(ct.read("get_market_count")):
        print(ct.summary(ct.market(ct.read("get_market_id_at", [i]))))
    print(json.dumps(ct.read("get_accounting"), indent=1))


def cmd_propose(ct: Court, mid):
    ct.send(ct.a, "propose_resolution", [mid], value=RES_BOND, label=f"propose resolution ({mid})")


def cmd_challenge(ct: Court, mid):
    ct.send(ct.b, "challenge_verdict", [mid], value=CHAL_BOND, label=f"challenge verdict ({mid})")


def cmd_jury(ct: Court, mid):
    ct.send(ct.a, "resolve_disputed_market", [mid], label=f"convene jury ({mid})", retries=400)
    print(json.dumps(ct.read("get_jury_verdict", [mid]), indent=1))


def cmd_finalize(ct: Court):
    now = c.chain_now()
    for i in range(ct.read("get_market_count")):
        mid = ct.read("get_market_id_at", [i])
        m = ct.market(mid)
        if m["status_name"] == "TENTATIVE_RESOLVED":
            if now > m["challenge_deadline"]:
                ct.send(ct.a, "finalize_resolution", [mid], label=f"finalize ({mid})")
            else:
                print(f"{mid}: window open for {m['challenge_deadline'] - now}s more")
        print(ct.summary(ct.market(mid)))


def cmd_claim(ct: Court):
    for acct in (ct.a, ct.b):
        for i in range(ct.read("get_market_count")):
            mid = ct.read("get_market_id_at", [i])
            if ct.read("quote_payout", [mid, acct.address.lower()]) > 0:
                ct.send(acct, "claim_payout", [mid], label=f"claim payout ({mid})")
        if ct.read("credits_of", [acct.address.lower()]) > 0:
            ct.send(acct, "withdraw_credits", [], label="withdraw credits")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    ct = Court()
    {"seed": lambda: cmd_seed(ct), "status": lambda: cmd_status(ct), "finalize": lambda: cmd_finalize(ct),
     "claim": lambda: cmd_claim(ct), "propose": lambda: cmd_propose(ct, sys.argv[2]),
     "challenge": lambda: cmd_challenge(ct, sys.argv[2]), "jury": lambda: cmd_jury(ct, sys.argv[2])}[cmd]()


if __name__ == "__main__":
    main()
