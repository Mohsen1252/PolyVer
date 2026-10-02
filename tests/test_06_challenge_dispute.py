"""Challenge game: bond rules, 7-juror panel, slashing arithmetic."""

import json

import pytest

from tests.conftest import (CHAL_BOND, DISPUTED, FINALIZED, GEN, NO, RES_BOND, TENTATIVE, VOID, VOIDED, YES)

POOL = 4 * GEN  # alice 3 YES + bob 1 NO
FEE = POOL // 100


def disputed(env, bets=True):
    """m1: alice 3 YES / bob 1 NO, charlie proposes YES, bob challenges."""
    env.create()
    if bets:
        env.bet(env.alice, YES, 3 * GEN)
        env.bet(env.bob, NO, GEN)
    env.propose()
    env.challenge()


# ------------------------------------------------------------- challenge entry
@pytest.mark.parametrize("bond", [0, 1, RES_BOND, CHAL_BOND - 1, CHAL_BOND + 1, GEN])
def test_challenge_bond_must_be_exact(env, bond):
    env.create()
    env.propose()
    with env.vm.expect_revert("exactly 0.2 GEN"):
        env.call(env.bob, env.c.challenge_verdict, "m1", value=bond)


def test_challenge_requires_tentative_verdict(env):
    env.create()
    with env.vm.expect_revert("no tentative verdict"):
        env.challenge()


def test_proposer_cannot_challenge_self(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("proposer cannot challenge"):
        env.challenge(who=env.charlie)


def test_challenge_flips_to_disputed(env):
    disputed(env)
    m = env.market()
    assert m["status"] == DISPUTED and m["status_name"] == "DISPUTED"
    assert m["dispute_challenger"] == env.key(env.bob) and m["challenge_bond"] == CHAL_BOND


def test_challenge_locks_both_bonds(env):
    disputed(env)
    a = env.acct()
    assert a["locked_bonds"] == RES_BOND + CHAL_BOND and a["invariant_ok"]


def test_second_challenge_rejected(env):
    disputed(env)
    with env.vm.expect_revert("no tentative verdict"):
        env.challenge(who=env.alice)


def test_can_challenge_view(env):
    env.create()
    assert env.c.can_challenge("m1") is False
    env.propose()
    assert env.c.can_challenge("m1") is True
    assert env.c.can_challenge("ghost") is False
    env.after_window()
    assert env.c.can_challenge("m1") is False


def test_can_challenge_false_once_disputed(env):
    disputed(env)
    assert env.c.can_challenge("m1") is False


def test_finalize_blocked_while_disputed(env):
    disputed(env)
    env.after_window()
    with env.vm.expect_revert("no uncontested tentative verdict"):
        env.call(env.owner, env.c.finalize_resolution, "m1")


def test_claim_blocked_while_disputed(env):
    disputed(env)
    with env.vm.expect_revert("market not settled"):
        env.call(env.alice, env.c.claim_payout, "m1")


def test_resolve_requires_disputed_state(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("market not disputed"):
        env.call(env.owner, env.c.resolve_disputed_market, "m1")


def test_resolve_twice_rejected(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    with env.vm.expect_revert("market not disputed"):
        env.call(env.owner, env.c.resolve_disputed_market, "m1")


def test_anyone_can_convene_jury(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7, who=env.alice)
    assert env.market()["status"] == FINALIZED


def test_proposer_may_not_challenge_even_after_other_challenge_failed(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("proposer cannot challenge"):
        env.challenge(who=env.charlie)


# ------------------------------------------------- proposer upheld (slash challenger)
def test_upheld_proposer_gets_bond_half_slash_and_fee(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    expected = RES_BOND + CHAL_BOND // 2 + FEE
    assert env.c.credits_of(env.key(env.charlie)) == expected


def test_upheld_challenger_bond_fully_lost(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    assert env.c.credits_of(env.key(env.bob)) == 0


def test_upheld_vault_gets_other_half(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    assert env.acct()["vault"] == CHAL_BOND // 2


def test_upheld_final_verdict_and_status(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    m = env.market()
    assert m["status"] == FINALIZED and m["final_verdict"] == YES
    assert m["resolution_bond"] == 0 and m["challenge_bond"] == 0


def test_upheld_accounting_invariant(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    a = env.acct()
    assert a["invariant_ok"] and a["locked_bonds"] == 0
    assert a["credits_total"] + a["vault"] == RES_BOND + CHAL_BOND + FEE


def test_upheld_slash_split_sums_to_challenger_bond(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    to_proposer = env.c.credits_of(env.key(env.charlie)) - RES_BOND - FEE
    assert to_proposer + env.acct()["vault"] == CHAL_BOND


# --------------------------------------------- challenger upheld (slash proposer)
def test_overturn_challenger_gets_bond_back_half_slash_and_fee(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    assert env.c.credits_of(env.key(env.bob)) == CHAL_BOND + RES_BOND // 2 + FEE


def test_overturn_proposer_bond_fully_lost(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    assert env.c.credits_of(env.key(env.charlie)) == 0


def test_overturn_vault_gets_other_half(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    assert env.acct()["vault"] == RES_BOND // 2


def test_overturn_final_verdict_is_jury_outcome(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    m = env.market()
    assert m["final_verdict"] == NO and m["status"] == FINALIZED
    assert m["proposed_outcome"] == YES  # original tentative verdict preserved for the record


def test_overturn_payouts_follow_jury_verdict(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    assert env.c.quote_payout("m1", env.key(env.bob)) == POOL - FEE
    assert env.c.quote_payout("m1", env.key(env.alice)) == 0


def test_overturn_accounting_invariant(env):
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    a = env.acct()
    assert a["invariant_ok"]
    assert a["credits_total"] + a["vault"] == RES_BOND + CHAL_BOND + FEE


def test_slash_of_odd_bond_has_no_rounding_loss(env):
    """Half-split uses floor for the winner and the remainder for the vault: nothing is lost."""
    disputed(env)
    env.dispute_resolved(["NO"] * 7)
    to_challenger = env.c.credits_of(env.key(env.bob)) - CHAL_BOND - FEE
    assert to_challenger + env.acct()["vault"] == RES_BOND


# ---------------------------------------------------------- jury tally rules
@pytest.mark.parametrize("votes,expected,pct", [
    (["YES"] * 7, YES, 100),
    (["YES"] * 6 + ["NO"], YES, 85),
    (["YES"] * 5 + ["NO"] * 2, YES, 71),
    (["YES"] * 5 + ["VOID"] * 2, YES, 71),
    (["NO"] * 7, NO, 100),
    (["NO"] * 5 + ["YES"] * 2, NO, 71),
    (["YES"] * 4 + ["NO"] * 3, VOID, 57),
    (["NO"] * 4 + ["YES"] * 3, VOID, 57),
    (["VOID"] * 7, VOID, 100),
    (["YES"] * 3 + ["NO"] * 2 + ["VOID"] * 2, VOID, 42),
    (["YES"] * 4 + ["VOID"] * 3, VOID, 57),
])
def test_jury_supermajority_rule(env, votes, expected, pct):
    disputed(env)
    env.dispute_resolved(votes)
    j = env.c.get_jury_verdict("m1")
    assert j["outcome"] == expected and env.market()["final_verdict"] == expected
    assert j["agreement_pct"] == pct
    assert j["yes"] == votes.count("YES") and j["no"] == votes.count("NO") and j["void"] == votes.count("VOID")


def test_jury_verdict_view_before_convening(env):
    disputed(env)
    j = env.c.get_jury_verdict("m1")
    assert j["convened"] is False and j["jury_size"] == 7 and j["quorum"] == 5


def test_jury_verdict_contains_seven_ballots(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    j = env.c.get_jury_verdict("m1")
    assert j["convened"] is True and len(j["ballots"]) == 7
    assert [b["id"] for b in j["ballots"]] == list(range(1, 8))
    assert j["ballots"][0]["lens"].startswith("Textual literalist")
    assert j["final_verdict_name"] == "YES"


def test_jury_ballots_carry_reasons_and_sources(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    j = env.c.get_jury_verdict("m1")
    assert j["ballots"][2]["reason"] == "reason 3"
    assert len(j["sources"]) == 3


def test_jury_summary_replaces_evidence_summary(env):
    disputed(env)
    env.jury_as(["YES"] * 7, summary="Panel: sources are unanimous.")
    env.call(env.owner, env.c.resolve_disputed_market, "m1")
    assert env.market()["evidence_summary"] == "Panel: sources are unanimous."


@pytest.mark.parametrize("n", [0, 3, 6, 8])
def test_jury_needs_exactly_seven_ballots(env, n):
    disputed(env)
    env.jury_as(["YES"] * n)
    with pytest.raises(Exception, match="LLM_ERROR"):
        env.call(env.owner, env.c.resolve_disputed_market, "m1")


def test_jury_unknown_votes_count_as_void(env):
    disputed(env)
    env.dispute_resolved(["YES", "YES", "YES", "YES", "maybe", "???", ""])
    j = env.c.get_jury_verdict("m1")
    assert j["yes"] == 4 and j["void"] == 3 and j["outcome"] == VOID


def test_jury_lowercase_votes_normalised(env):
    disputed(env)
    env.dispute_resolved(["yes"] * 7)
    assert env.market()["final_verdict"] == YES


def test_jury_with_garbage_reply_reverts(env):
    disputed(env)
    env.vm.mock_llm(r".*PV-JURY.*", "not json at all")
    with pytest.raises(Exception):
        env.call(env.owner, env.c.resolve_disputed_market, "m1")


def test_jury_prompt_carries_contested_verdict(env):
    disputed(env)
    env.vm.mock_llm(r"(?s).*PV-JURY.*<contested>YES:.*", __import__("tests.conftest", fromlist=["x"]).llm_json({
        "jurors": [{"id": i, "vote": "YES", "reason": "r"} for i in range(1, 8)], "summary": "s"}))
    env.call(env.owner, env.c.resolve_disputed_market, "m1")
    assert env.market()["final_verdict"] == YES


def test_jury_without_readable_evidence_voids_unanimously(env):
    disputed(env)
    env.vm.clear_mocks()
    for h in ("reuters.com", "apnews.com", "bbc.com"):
        env.web_status(h, 404)
    env.call(env.owner, env.c.resolve_disputed_market, "m1")
    j = env.c.get_jury_verdict("m1")
    assert j["void"] == 7 and env.market()["final_verdict"] == VOID


def test_jury_transient_web_failure_reverts(env):
    disputed(env)
    env.vm.clear_mocks()
    for h in ("reuters.com", "apnews.com", "bbc.com"):
        env.web_status(h, 502)
    with pytest.raises(Exception, match="TRANSIENT"):
        env.call(env.owner, env.c.resolve_disputed_market, "m1")


# ------------------------------------------------ void verdicts inside disputes
def test_jury_void_overturns_yes_and_refunds(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 4 + ["NO"] * 3)
    m = env.market()
    assert m["status"] == VOIDED and m["fee_amount"] == 0
    assert env.c.credits_of(env.key(env.bob)) == CHAL_BOND + RES_BOND // 2
    assert env.c.credits_of(env.key(env.charlie)) == 0
    assert env.c.quote_payout("m1", env.key(env.alice)) == 3 * GEN
    assert env.c.quote_payout("m1", env.key(env.bob)) == GEN


def test_proposed_void_upheld_by_void_jury(env):
    env.create()
    env.bet(env.alice, YES, 3 * GEN)
    env.bet(env.bob, NO, GEN)
    env.propose(stances=["UNCLEAR"] * 3)
    env.challenge(who=env.alice)
    env.dispute_resolved(["VOID"] * 7)
    m = env.market()
    assert m["status"] == VOIDED
    assert env.c.credits_of(env.key(env.charlie)) == RES_BOND + CHAL_BOND // 2
    assert env.acct()["vault"] == CHAL_BOND // 2


def test_proposed_void_overturned_to_yes(env):
    env.create()
    env.bet(env.alice, YES, 3 * GEN)
    env.bet(env.bob, NO, GEN)
    env.propose(stances=["UNCLEAR"] * 3)
    env.challenge(who=env.bob)
    env.dispute_resolved(["YES"] * 7)
    m = env.market()
    assert m["status"] == FINALIZED and m["final_verdict"] == YES
    assert env.c.credits_of(env.key(env.bob)) == CHAL_BOND + RES_BOND // 2 + FEE


def test_dispute_on_empty_market(env):
    disputed(env, bets=False)
    env.dispute_resolved(["YES"] * 7)
    assert env.market()["status"] == VOIDED  # no winning pool: refunds (none), no fee
    a = env.acct()
    assert a["invariant_ok"] and a["credits_total"] + a["vault"] == RES_BOND + CHAL_BOND


# ---------------------------------------------------------------- vault
def test_vault_withdraw_by_governor(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    env.call(env.owner, env.c.withdraw_vault, env.key(env.alice), CHAL_BOND // 2)
    a = env.acct()
    assert a["vault"] == 0 and a["invariant_ok"] and a["total_out"] == CHAL_BOND // 2


def test_vault_partial_withdraw(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    env.call(env.owner, env.c.withdraw_vault, env.key(env.alice), 10)
    assert env.acct()["vault"] == CHAL_BOND // 2 - 10


def test_vault_withdraw_non_governor_rejected(env):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    with env.vm.expect_revert("governor only"):
        env.call(env.alice, env.c.withdraw_vault, env.key(env.alice), 1)


@pytest.mark.parametrize("amount", [0, CHAL_BOND])
def test_vault_withdraw_bounds(env, amount):
    disputed(env)
    env.dispute_resolved(["YES"] * 7)
    with env.vm.expect_revert("invalid vault amount"):
        env.call(env.owner, env.c.withdraw_vault, env.key(env.alice), amount)


def test_vault_empty_before_any_slash(env):
    env.create()
    with env.vm.expect_revert("invalid vault amount"):
        env.call(env.owner, env.c.withdraw_vault, env.key(env.alice), 1)
