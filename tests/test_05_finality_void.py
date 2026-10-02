"""Uncontested optimistic finality, ambiguous voiding and refund pools."""

import pytest

from tests.conftest import (DAY, FINALIZED, GEN, NO, OPEN, RES_BOND, TENTATIVE, VOID, VOIDED, YES)

FEE = 4 * GEN // 100  # 1% of a 4 GEN pool


def test_cannot_finalize_open_market(env):
    env.create()
    with env.vm.expect_revert("no uncontested tentative verdict"):
        env.call(env.owner, env.c.finalize_resolution, "m1")


def test_cannot_finalize_inside_window(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("challenge window still open"):
        env.call(env.owner, env.c.finalize_resolution, "m1")


def test_cannot_finalize_one_second_early(env):
    env.create()
    env.propose()
    env.warp(env.market()["challenge_deadline"] - 1)
    with env.vm.expect_revert("challenge window still open"):
        env.call(env.owner, env.c.finalize_resolution, "m1")


def test_finalize_exactly_at_deadline(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    env.propose()
    env.warp(env.market()["challenge_deadline"])
    env.call(env.owner, env.c.finalize_resolution, "m1")
    assert env.market()["status"] == FINALIZED


def test_uncontested_yes_is_final(env):
    env.settled_market()
    m = env.market()
    assert m["status"] == FINALIZED and m["final_verdict"] == YES
    assert m["final_verdict_name"] == "YES"


def test_uncontested_no_is_final(env):
    env.settled_market(("NO", "NO", "NO"))
    assert env.market()["final_verdict"] == NO and env.market()["status"] == FINALIZED


def test_anyone_can_finalize(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    env.propose()
    env.after_window()
    env.call(env.bob, env.c.finalize_resolution, "m1")
    assert env.market()["status"] == FINALIZED


def test_proposer_gets_bond_plus_fee(env):
    env.settled_market()
    assert env.c.credits_of(env.key(env.charlie)) == RES_BOND + FEE


def test_fee_is_one_percent_of_pool(env):
    env.settled_market()
    m = env.market()
    assert m["fee_amount"] == FEE and m["distributable"] == 4 * GEN - FEE


def test_finalize_twice_rejected(env):
    env.settled_market()
    with env.vm.expect_revert("no uncontested tentative verdict"):
        env.call(env.owner, env.c.finalize_resolution, "m1")


def test_locked_bond_released_on_finalize(env):
    env.settled_market()
    a = env.acct()
    assert a["locked_bonds"] == 0 and a["invariant_ok"]


def test_withdraw_credits_pays_proposer(env):
    env.settled_market()
    paid = env.call(env.charlie, env.c.withdraw_credits)
    assert paid == RES_BOND + FEE
    assert env.c.credits_of(env.key(env.charlie)) == 0
    assert env.acct()["total_out"] == RES_BOND + FEE and env.acct()["invariant_ok"]


def test_withdraw_credits_twice_rejected(env):
    env.settled_market()
    env.call(env.charlie, env.c.withdraw_credits)
    with env.vm.expect_revert("no credits"):
        env.call(env.charlie, env.c.withdraw_credits)


def test_withdraw_credits_without_balance(env):
    env.settled_market()
    with env.vm.expect_revert("no credits"):
        env.call(env.bob, env.c.withdraw_credits)


def test_can_finalize_view(env):
    env.create()
    assert env.c.can_finalize("m1") is False
    env.propose()
    assert env.c.can_finalize("m1") is False
    env.after_window()
    assert env.c.can_finalize("m1") is True
    assert env.c.can_finalize("ghost") is False


def test_challenge_after_deadline_rejected(env):
    env.create()
    env.propose()
    env.after_window()
    with env.vm.expect_revert("challenge window closed"):
        env.challenge()


def test_challenge_exactly_at_deadline_rejected(env):
    env.create()
    env.propose()
    env.warp(env.market()["challenge_deadline"])
    with env.vm.expect_revert("challenge window closed"):
        env.challenge()


def test_no_fee_without_funded_winner_pool_goes_void(env):
    env.settled_market(yes_bets=[], no_bets=[(env.bob, GEN)])  # YES verdict, nobody on YES
    m = env.market()
    assert m["status"] == VOIDED and m["fee_amount"] == 0 and m["distributable"] == GEN


# ------------------------------------------------------------- ambiguous void
def test_ambiguous_news_voids_market(env):
    env.settled_market(("YES", "NO", "UNCLEAR"), )
    m = env.market()
    assert m["status"] == VOIDED and m["final_verdict"] == VOID
    assert m["final_verdict_name"] == "AMBIGUOUS_VOID"


def test_void_charges_no_fee(env):
    env.settled_market(("UNCLEAR",) * 3)
    m = env.market()
    assert m["fee_amount"] == 0 and m["distributable"] == 4 * GEN


def test_void_returns_only_bond_to_proposer(env):
    env.settled_market(("UNCLEAR",) * 3)
    assert env.c.credits_of(env.key(env.charlie)) == RES_BOND


def test_void_refunds_full_principal_to_both_sides(env):
    env.settled_market(("UNCLEAR",) * 3)
    assert env.c.quote_payout("m1", env.key(env.alice)) == 3 * GEN
    assert env.c.quote_payout("m1", env.key(env.bob)) == GEN
    assert env.call(env.alice, env.c.claim_payout, "m1") == 3 * GEN
    assert env.call(env.bob, env.c.claim_payout, "m1") == GEN
    assert env.acct()["pool_held"] == 0


def test_void_refund_for_user_on_both_sides(env):
    env.settled_market(("UNCLEAR",) * 3, yes_bets=[(env.alice, 2 * GEN)], no_bets=[(env.alice, 5 * GEN)])
    assert env.call(env.alice, env.c.claim_payout, "m1") == 7 * GEN


def test_void_with_no_bets_is_clean(env):
    env.settled_market(("UNCLEAR",) * 3, yes_bets=[], no_bets=[])
    assert env.market()["status"] == VOIDED
    assert env.acct()["pool_held"] == 0 and env.acct()["invariant_ok"]


def test_no_sources_readable_void_refunds(env):
    env.create()
    env.bet(env.alice, YES, GEN)
    for h in ("reuters.com", "apnews.com", "bbc.com"):
        env.web_status(h, 404)
    env.after_end()
    env.call(env.charlie, env.c.propose_resolution, "m1", value=RES_BOND)
    env.finalize()
    assert env.call(env.alice, env.c.claim_payout, "m1") == GEN


def test_void_accounting_invariant(env):
    env.settled_market(("UNCLEAR",) * 3)
    env.call(env.alice, env.c.claim_payout, "m1")
    env.call(env.bob, env.c.claim_payout, "m1")
    env.call(env.charlie, env.c.withdraw_credits)
    a = env.acct()
    assert a["invariant_ok"] and a["tracked_holdings"] == 0 and a["total_in"] == a["total_out"]
