"""Pull payments, pro-rata math, post-deadline claim accounting and re-entrancy (CEI) safety."""

import pytest

from tests.conftest import (CHAL_BOND, DAY, FINALIZED, GEN, NO, OPEN, RES_BOND, VOID, VOIDED, YES)

STALE = 30 * DAY


def check(env):
    a = env.acct()
    assert a["invariant_ok"], a
    return a


# ------------------------------------------------------------------ pro-rata
def test_single_winner_takes_whole_distributable(env):
    env.settled_market()
    assert env.call(env.alice, env.c.claim_payout, "m1") == 4 * GEN - 4 * GEN // 100


def test_two_winners_split_pro_rata(env):
    env.settled_market(yes_bets=[(env.alice, GEN), (env.owner, 3 * GEN)], no_bets=[(env.bob, 4 * GEN)])
    dist = 8 * GEN - 8 * GEN // 100
    assert env.c.quote_payout("m1", env.key(env.alice)) == GEN * dist // (4 * GEN)
    assert env.c.quote_payout("m1", env.key(env.owner)) == 3 * GEN * dist // (4 * GEN)


def test_winner_profit_exceeds_stake(env):
    env.settled_market()
    assert env.c.quote_payout("m1", env.key(env.alice)) > 3 * GEN


def test_loser_has_nothing_to_claim(env):
    env.settled_market()
    assert env.c.quote_payout("m1", env.key(env.bob)) == 0
    with env.vm.expect_revert("nothing to claim"):
        env.call(env.bob, env.c.claim_payout, "m1")


def test_no_verdict_pays_no_side(env):
    env.settled_market(("NO",) * 3)
    assert env.call(env.bob, env.c.claim_payout, "m1") == 4 * GEN - 4 * GEN // 100
    with env.vm.expect_revert("nothing to claim"):
        env.call(env.alice, env.c.claim_payout, "m1")


def test_hedger_wins_only_on_winning_side(env):
    env.settled_market(yes_bets=[(env.alice, 2 * GEN)], no_bets=[(env.alice, 1 * GEN), (env.bob, 1 * GEN)])
    # alice holds 2 YES and 1 NO; YES wins: 2/2 of distributable
    assert env.c.quote_payout("m1", env.key(env.alice)) == 4 * GEN - 4 * GEN // 100


def test_non_bettor_has_nothing(env):
    env.settled_market()
    with env.vm.expect_revert("nothing to claim"):
        env.call(env.charlie, env.c.claim_payout, "m1")


def test_quote_matches_actual_claim(env):
    env.settled_market(yes_bets=[(env.alice, 7), (env.owner, 13)], no_bets=[(env.bob, 101)])
    for who in (env.alice, env.owner):
        q = env.c.quote_payout("m1", env.key(who))
        assert env.call(who, env.c.claim_payout, "m1") == q


def test_rounding_dust_is_bounded_and_never_overpays(env):
    stakes = [(env.alice, 1), (env.owner, 1), (env.charlie, 1)]
    env.settled_market(yes_bets=stakes, no_bets=[(env.bob, 10)])
    dist = env.market()["distributable"]
    paid = sum(env.call(w, env.c.claim_payout, "m1") for w, _ in stakes)
    assert paid <= dist and dist - paid < len(stakes)
    check(env)


def test_sum_of_claims_never_exceeds_distributable(env):
    stakes = [(env.alice, 333), (env.owner, 667), (env.charlie, 1001)]
    env.settled_market(yes_bets=stakes, no_bets=[(env.bob, 5)])
    paid = sum(env.call(w, env.c.claim_payout, "m1") for w, _ in stakes)
    assert paid <= env.market()["distributable"]


def test_claimed_total_tracks_payouts(env):
    env.settled_market()
    paid = env.call(env.alice, env.c.claim_payout, "m1")
    assert env.market()["claimed_total"] == paid


def test_zero_winning_pool_refunds_instead_of_burning(env):
    env.settled_market(yes_bets=[], no_bets=[(env.bob, 2 * GEN)])
    assert env.call(env.bob, env.c.claim_payout, "m1") == 2 * GEN


# ------------------------------------------------------- claim guard rails
@pytest.mark.parametrize("stage", ["open", "tentative"])
def test_claim_before_settlement_rejected(env, stage):
    env.create()
    env.bet(env.alice, YES, GEN)
    if stage == "tentative":
        env.propose()
    with env.vm.expect_revert("market not settled"):
        env.call(env.alice, env.c.claim_payout, "m1")


def test_claim_unknown_market(env):
    with env.vm.expect_revert("unknown market"):
        env.call(env.alice, env.c.claim_payout, "ghost")


def test_double_claim_rejected(env):
    env.settled_market()
    env.call(env.alice, env.c.claim_payout, "m1")
    with env.vm.expect_revert("already claimed"):
        env.call(env.alice, env.c.claim_payout, "m1")


def test_double_claim_does_not_move_accounting(env):
    env.settled_market()
    env.call(env.alice, env.c.claim_payout, "m1")
    before = env.acct()
    with pytest.raises(Exception):
        env.call(env.alice, env.c.claim_payout, "m1")
    assert env.acct() == before


def test_claim_marks_position_claimed(env):
    env.settled_market()
    env.call(env.alice, env.c.claim_payout, "m1")
    assert env.c.get_position("m1", env.key(env.alice))["claimed"] is True
    assert env.c.quote_payout("m1", env.key(env.alice)) == 0


def test_claim_effects_applied_before_transfer(env):
    """CEI: by the time the transfer is queued the claim flag and counters are already debited."""
    env.settled_market()
    out_before = env.acct()["total_out"]
    paid = env.call(env.alice, env.c.claim_payout, "m1")
    a = check(env)
    assert a["total_out"] == out_before + paid


def test_failed_transfer_rolls_back_claim(env, monkeypatch):
    env.settled_market()
    import genlayer as sdk

    class Boom:
        def __init__(self, *_a, **_k):
            pass

        def emit_transfer(self, *_a, **_k):
            raise RuntimeError("transfer queue rejected")

    monkeypatch.setattr(sdk.chain, "Account", Boom)
    before = env.acct()
    with pytest.raises(Exception, match="transfer failed"):
        env.call(env.alice, env.c.claim_payout, "m1")
    assert env.acct() == before
    assert env.c.get_position("m1", env.key(env.alice))["claimed"] is False
    assert env.c.quote_payout("m1", env.key(env.alice)) > 0  # retryable


def test_failed_credit_transfer_rolls_back(env, monkeypatch):
    env.settled_market()
    import genlayer as sdk

    class Boom:
        def __init__(self, *_a, **_k):
            pass

        def emit_transfer(self, *_a, **_k):
            raise RuntimeError("nope")

    monkeypatch.setattr(sdk.chain, "Account", Boom)
    before = env.c.credits_of(env.key(env.charlie))
    with pytest.raises(Exception, match="transfer failed"):
        env.call(env.charlie, env.c.withdraw_credits)
    assert env.c.credits_of(env.key(env.charlie)) == before
    check(env)


# --------------------------------------------------- post-deadline accounting
def test_claims_long_after_deadline_keep_invariant(env):
    env.settled_market()
    env.warp(env.market()["challenge_deadline"] + 400 * DAY)
    env.call(env.alice, env.c.claim_payout, "m1")
    env.call(env.charlie, env.c.withdraw_credits)
    a = check(env)
    assert a["pool_held"] == a["total_in"] - a["total_out"] - a["credits_total"] - a["vault"] - a["locked_bonds"]


def test_full_lifecycle_drains_to_zero(env):
    env.settled_market()
    env.call(env.alice, env.c.claim_payout, "m1")
    env.call(env.charlie, env.c.withdraw_credits)
    a = check(env)
    assert a["tracked_holdings"] == 0 and a["total_in"] == a["total_out"]


def test_invariant_holds_after_every_step(env):
    env.create()
    check(env)
    env.bet(env.alice, YES, 3 * GEN)
    check(env)
    env.bet(env.bob, NO, GEN)
    check(env)
    env.propose()
    check(env)
    env.challenge()
    check(env)
    env.dispute_resolved(["NO"] * 7)
    check(env)
    env.call(env.bob, env.c.claim_payout, "m1")
    check(env)
    env.call(env.bob, env.c.withdraw_credits)
    check(env)
    env.call(env.owner, env.c.withdraw_vault, env.key(env.owner), env.acct()["vault"])
    a = check(env)
    assert a["tracked_holdings"] == 0 and a["total_in"] == a["total_out"]


def test_multi_market_accounting_is_additive(env):
    env.create("a")
    env.create("b")
    env.bet(env.alice, YES, GEN, "a")
    env.bet(env.bob, NO, 2 * GEN, "b")
    a = check(env)
    assert a["pool_held"] == 3 * GEN


def test_markets_settle_independently(env):
    env.create("a")
    env.create("b")
    env.bet(env.alice, YES, GEN, "a")
    env.bet(env.alice, YES, GEN, "b")
    env.propose(mid="a")
    env.after_window("a")
    env.call(env.owner, env.c.finalize_resolution, "a")
    assert env.market("a")["status"] == FINALIZED and env.market("b")["status"] == OPEN
    with env.vm.expect_revert("market not settled"):
        env.call(env.alice, env.c.claim_payout, "b")


def test_credits_accumulate_across_markets(env):
    for mid in ("a", "b"):
        env.create(mid)
        env.bet(env.alice, YES, GEN, mid)
    for mid in ("a", "b"):
        env.propose(mid=mid)
        env.after_window(mid)
        env.call(env.owner, env.c.finalize_resolution, mid)
    assert env.c.credits_of(env.key(env.charlie)) == 2 * (RES_BOND + GEN // 100)


# ----------------------------------------------------------------- stale void
def test_stale_market_cannot_be_voided_early(env):
    env.create()
    env.warp(env.end + STALE - 1)
    with env.vm.expect_revert("not stale yet"):
        env.call(env.bob, env.c.void_stale_market, "m1")


def test_stale_market_voids_and_refunds(env):
    env.create()
    env.bet(env.alice, YES, 2 * GEN)
    env.bet(env.bob, NO, GEN)
    env.warp(env.end + STALE)
    env.call(env.charlie, env.c.void_stale_market, "m1")
    assert env.market()["status"] == VOIDED
    assert env.call(env.alice, env.c.claim_payout, "m1") == 2 * GEN
    assert env.call(env.bob, env.c.claim_payout, "m1") == GEN
    assert check(env)["pool_held"] == 0


def test_stale_void_only_for_open_markets(env):
    env.create()
    env.propose()
    env.warp(env.end + STALE)
    with env.vm.expect_revert("market not open"):
        env.call(env.bob, env.c.void_stale_market, "m1")


def test_stale_void_unknown_market(env):
    with env.vm.expect_revert("unknown market"):
        env.call(env.bob, env.c.void_stale_market, "ghost")


# ------------------------------------------------------------ views / governance
def test_constants(env):
    k = env.c.get_constants()
    assert k["resolution_bond"] == RES_BOND and k["challenge_bond"] == CHAL_BOND
    assert k["challenge_window"] == DAY and k["fee_bps"] == 100
    assert k["jury_size"] == 7 and k["jury_quorum"] == 5 and k["min_confidence"] == 60
    assert k["governor"] == env.key(env.owner)


def test_whoami_is_lowercase_hex(env):
    k = env.key(env.alice)
    assert k.startswith("0x") and k == k.lower() and len(k) == 42


def test_position_view_for_stranger_is_zero(env):
    env.create()
    p = env.c.get_position("m1", env.key(env.charlie))
    assert p == {"yes": 0, "no": 0, "claimed": False}


def test_credits_of_unknown_address_is_zero(env):
    assert env.c.credits_of("0x" + "00" * 20) == 0


def test_accounting_view_fresh_contract(env):
    a = env.acct()
    assert a["invariant_ok"] and a["total_in"] == 0 and a["tracked_holdings"] == 0


def test_address_case_insensitive_views(env):
    env.settled_market()
    k = env.key(env.alice)
    assert env.c.quote_payout("m1", k.upper().replace("0X", "0x")) == env.c.quote_payout("m1", k)
