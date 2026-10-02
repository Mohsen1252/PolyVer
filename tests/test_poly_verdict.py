"""Audit-fix regressions: source freeze, stale-dispute void, read quorum."""

import pytest

from tests.conftest import CHAL_BOND, DAY, GEN, NO, RES_BOND, VOID, VOIDED, YES

STALE_DISPUTE = 7 * DAY


def disputed(env):
    env.create()
    env.bet(env.alice, YES, 3 * GEN)
    env.bet(env.owner, NO, GEN)
    env.propose()
    env.challenge()  # bob
    return env.market()["disputed_at"]


def test_cannot_add_source_after_bets_placed(env):
    env.create(urls=["https://www.reuters.com/a"])
    env.bet(env.bob, YES, 1)
    with env.vm.expect_revert("ERR_MARKET_ALREADY_ACTIVE"):
        env.call(env.alice, env.c.add_source, "m1", "https://apnews.com/z")


def test_cannot_add_source_after_market_end(env):
    env.create(urls=["https://www.reuters.com/a"])
    env.after_end()
    with env.vm.expect_revert("ERR_MARKET_ALREADY_ACTIVE"):
        env.call(env.alice, env.c.add_source, "m1", "https://apnews.com/z")


def test_add_source_still_allowed_before_bets_and_end(env):
    env.create(urls=["https://www.reuters.com/a"])
    env.call(env.alice, env.c.add_source, "m1", "https://apnews.com/z")
    assert len(env.market()["source_urls"]) == 2


def test_void_stale_disputed_market_refunds_all_bonds_and_bettors(env):
    at = disputed(env)
    env.warp(at + STALE_DISPUTE)
    env.call(env.charlie, env.c.void_stale_disputed_market, "m1")
    m = env.market()
    assert m["status"] == VOIDED and m["final_verdict"] == VOID and m["fee_amount"] == 0
    assert env.c.credits_of(env.key(env.charlie)) == RES_BOND
    assert env.c.credits_of(env.key(env.bob)) == CHAL_BOND
    a = env.acct()
    assert a["locked_bonds"] == 0 and a["invariant_ok"]
    assert env.call(env.alice, env.c.claim_payout, "m1") == 3 * GEN
    assert env.call(env.owner, env.c.claim_payout, "m1") == GEN
    env.call(env.charlie, env.c.withdraw_credits)
    env.call(env.bob, env.c.withdraw_credits)
    a = env.acct()
    assert a["invariant_ok"] and a["tracked_holdings"] == 0 and a["total_in"] == a["total_out"]


def test_void_stale_disputed_market_rejects_before_timeout(env):
    at = disputed(env)
    env.warp(at + STALE_DISPUTE - 1)
    with env.vm.expect_revert("dispute not stale yet"):
        env.call(env.charlie, env.c.void_stale_disputed_market, "m1")


def test_void_stale_disputed_requires_disputed_state(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("market not disputed"):
        env.call(env.charlie, env.c.void_stale_disputed_market, "m1")


def test_void_stale_disputed_cannot_run_twice(env):
    at = disputed(env)
    env.warp(at + STALE_DISPUTE)
    env.call(env.charlie, env.c.void_stale_disputed_market, "m1")
    with env.vm.expect_revert("market not disputed"):
        env.call(env.charlie, env.c.void_stale_disputed_market, "m1")


def test_jury_still_works_before_stale_window(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    assert env.market()["final_verdict"] == YES


def test_disputed_at_recorded(env):
    at = disputed(env)
    assert at == env.market()["challenge_deadline"] - DAY or at > 0


def test_one_readable_of_three_sources_voids(env):
    """Read quorum: a multi-source market must read >= 2 sources."""
    env.create()
    env.web_status("apnews.com", 404)
    env.web_status("bbc.com", 404)
    env.web_ok()
    env.adjudicate_as(["YES"], outcome="YES", confidence=99)
    env.after_end()
    env.call(env.charlie, env.c.propose_resolution, "m1", value=RES_BOND)
    assert env.market()["proposed_outcome"] == VOID


def test_two_readable_of_three_sources_still_resolves(env):
    env.create()
    env.web_status("bbc.com", 404)
    env.web_ok()
    env.adjudicate_as(["YES", "YES"], outcome="YES")
    env.after_end()
    env.call(env.charlie, env.c.propose_resolution, "m1", value=RES_BOND)
    assert env.market()["proposed_outcome"] == YES
