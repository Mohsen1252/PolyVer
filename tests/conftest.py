"""Shared helpers for PolyVerdict direct-mode tests (in-memory GenVM, no network)."""

import json
from datetime import datetime, timezone

import pytest

CONTRACT = "contracts/poly_verdict.py"
GEN = 10**18
RES_BOND = GEN // 10
CHAL_BOND = GEN // 5
DAY = 86400
WHITELIST = ["reuters.com", "apnews.com", "bbc.com"]
URLS = ["https://www.reuters.com/a", "https://apnews.com/b", "https://www.bbc.com/c"]

T0 = 1_800_000_000  # fixed block clock for deterministic tests
YES, NO, VOID, UNRESOLVED = 1, 2, 3, 0
OPEN, RESOLVING, TENTATIVE, DISPUTED, FINALIZED, VOIDED = 0, 1, 2, 3, 4, 5


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def llm_json(payload: dict) -> str:
    """The direct-mode LLM mock parses once, the JSON decoder parses again."""
    return json.dumps(json.dumps(payload))


class Env:
    def __init__(self, vm, c, owner, alice, bob, charlie):
        self.vm, self.c = vm, c
        self.owner, self.alice, self.bob, self.charlie = owner, alice, bob, charlie
        self.t0 = T0
        self.end = self.t0 + 3600
        self.warp(self.t0)

    # -- clock ---------------------------------------------------------------
    def warp(self, ts: int) -> None:
        self.vm.warp(iso(ts))

    def after_end(self) -> None:
        self.warp(self.end + 10)

    # -- identities ----------------------------------------------------------
    def key(self, who) -> str:
        prev = self.vm.sender
        self.vm.sender = who
        k = self.c.whoami()
        self.vm.sender = prev
        return k

    # -- calls ---------------------------------------------------------------
    def call(self, who, fn, *args, value=0):
        self.vm.sender = who
        self.vm.value = value
        try:
            return fn(*args)
        finally:
            self.vm.value = 0

    def create(self, mid="m1", who=None, whitelist=None, urls=None, end=None, title="Will it happen?",
               spec="Resolves YES if the event is confirmed by the sources.") -> None:
        self.call(who or self.alice, self.c.create_market, mid, title, spec,
                  WHITELIST if whitelist is None else whitelist,
                  URLS if urls is None else urls, self.end if end is None else end)

    def bet(self, who, outcome, amount, mid="m1") -> None:
        self.call(who, self.c.place_prediction, mid, outcome, value=amount)

    def market(self, mid="m1") -> dict:
        return self.c.get_market(mid)

    def acct(self) -> dict:
        return self.c.get_accounting()

    # -- mocks ---------------------------------------------------------------
    def web_ok(self, pages=None) -> None:
        pages = pages or {}
        for host, html in {
            "reuters.com": "<html><title>Reuters report</title><body>The event was confirmed.</body></html>",
            "apnews.com": "<html><title>AP report</title><body>Officials confirm the event.</body></html>",
            "bbc.com": "<html><title>BBC report</title><body>The event took place.</body></html>",
            **pages,
        }.items():
            self.vm.mock_web(rf"{host.replace('.', r'\.')}", {"status": 200, "body": html})

    def web_status(self, host: str, status: int) -> None:
        self.vm.mock_web(rf"{host.replace('.', r'\.')}", {"status": status, "body": ""})

    def adjudicate_as(self, stances, outcome=None, confidence=90, reasoning="Sources agree.") -> None:
        if outcome is None:
            ys = {s for s in stances if s in ("YES", "NO")}
            outcome = ys.pop() if len(ys) == 1 else "AMBIGUOUS"
        self.vm.mock_llm(r".*PV-ADJUDICATION.*", llm_json({
            "sources": [{"index": i, "stance": s, "quote": f"quote {i}"} for i, s in enumerate(stances)],
            "outcome": outcome, "confidence": confidence, "reasoning": reasoning,
        }))

    def jury_as(self, votes, summary="Panel deliberated.") -> None:
        self.vm.mock_llm(r".*PV-JURY.*", llm_json({
            "jurors": [{"id": i + 1, "vote": v, "reason": f"reason {i + 1}"} for i, v in enumerate(votes)],
            "summary": summary,
        }))

    # -- lifecycle shortcuts -------------------------------------------------
    def propose(self, who=None, mid="m1", stances=("YES", "YES", "YES"), **kw) -> None:
        self.web_ok()
        self.adjudicate_as(list(stances), **kw)
        self.after_end()
        self.call(who or self.charlie, self.c.propose_resolution, mid, value=RES_BOND)

    def challenge(self, who=None, mid="m1") -> None:
        self.call(who or self.bob, self.c.challenge_verdict, mid, value=CHAL_BOND)

    def after_window(self, mid="m1") -> None:
        self.warp(self.market(mid)["challenge_deadline"] + 1)

    def finalize(self, mid="m1") -> None:
        self.after_window(mid)
        self.call(self.owner, self.c.finalize_resolution, mid)

    def dispute_resolved(self, votes, who=None, mid="m1") -> None:
        self.jury_as(votes)
        self.call(who or self.owner, self.c.resolve_disputed_market, mid)

    def settled_market(self, outcome_stances=("YES", "YES", "YES"), yes_bets=None, no_bets=None) -> None:
        """Market m1 with bets, resolved and finalized uncontested."""
        self.create()
        for who, amt in (yes_bets if yes_bets is not None else [(self.alice, 3 * GEN)]):
            self.bet(who, YES, amt)
        for who, amt in (no_bets if no_bets is not None else [(self.bob, 1 * GEN)]):
            self.bet(who, NO, amt)
        self.propose(stances=outcome_stances)
        self.finalize()


@pytest.fixture
def env(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.sender = direct_owner
    c = direct_deploy(CONTRACT)
    return Env(direct_vm, c, direct_owner, direct_alice, direct_bob, direct_charlie)
