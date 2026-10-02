import pytest

from tests.conftest import GEN, NO, OPEN, YES


def test_yes_bet_updates_pool(env):
    env.create()
    env.bet(env.alice, YES, 2 * GEN)
    m = env.market()
    assert m["yes_pool"] == 2 * GEN and m["no_pool"] == 0


def test_no_bet_updates_pool(env):
    env.create()
    env.bet(env.bob, NO, 5 * GEN)
    assert env.market()["no_pool"] == 5 * GEN


def test_bets_accumulate_per_user(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    env.bet(env.alice, YES, 2 * GEN)
    assert env.c.get_position("m1", env.key(env.alice))["yes"] == 3 * GEN


def test_user_can_hold_both_sides(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    env.bet(env.alice, NO, 2 * GEN)
    p = env.c.get_position("m1", env.key(env.alice))
    assert (p["yes"], p["no"]) == (GEN, 2 * GEN)


def test_positions_are_per_market(env):
    env.create("a")
    env.create("b")
    env.bet(env.alice, YES, GEN, "a")
    assert env.c.get_position("b", env.key(env.alice))["yes"] == 0


def test_zero_stake_rejected(env):
    env.create()
    with env.vm.expect_revert("non-zero"):
        env.bet(env.alice, YES, 0)


@pytest.mark.parametrize("outcome", [0, 3, 4, -1, 99])
def test_invalid_outcome_rejected(env, outcome):
    env.create()
    with env.vm.expect_revert("outcome must be 1"):
        env.bet(env.alice, outcome, GEN)


def test_bet_after_end_rejected(env):
    env.create()
    env.after_end()
    with env.vm.expect_revert("market ended"):
        env.bet(env.alice, YES, GEN)


def test_bet_exactly_at_end_rejected(env):
    env.create()
    env.warp(env.end)
    with env.vm.expect_revert("market ended"):
        env.bet(env.alice, YES, GEN)


def test_bet_just_before_end_ok(env):
    env.create()
    env.warp(env.end - 1)
    env.bet(env.alice, YES, GEN)
    assert env.market()["yes_pool"] == GEN


def test_bet_unknown_market(env):
    with env.vm.expect_revert("unknown market"):
        env.bet(env.alice, YES, GEN, "nope")


def test_bet_on_resolved_market_rejected(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    env.propose()
    with env.vm.expect_revert("not open for predictions"):
        env.bet(env.bob, NO, GEN)


def test_bets_tracked_in_accounting(env):
    env.create()
    env.bet(env.alice, YES, 3 * GEN)
    env.bet(env.bob, NO, 2 * GEN)
    a = env.acct()
    assert a["total_in"] == 5 * GEN and a["pool_held"] == 5 * GEN and a["invariant_ok"]


def test_tiny_stake_accepted(env):
    env.create()
    env.bet(env.alice, YES, 1)
    assert env.market()["yes_pool"] == 1


def test_huge_stake_accepted(env):
    env.create()
    env.bet(env.alice, YES, 10**30)
    assert env.market()["yes_pool"] == 10**30
