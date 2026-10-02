import pytest

from tests.conftest import GEN, OPEN, URLS, WHITELIST

LONG = "x" * 2000


def test_create_stores_all_fields(env):
    env.create()
    m = env.market()
    assert m["market_id"] == "m1"
    assert m["title"] == "Will it happen?"
    assert m["source_whitelist"] == WHITELIST
    assert m["source_urls"] == URLS
    assert m["status"] == OPEN and m["status_name"] == "OPEN"
    assert m["end_timestamp"] == env.end
    assert m["yes_pool"] == 0 and m["no_pool"] == 0
    assert m["proposed_outcome_name"] == "UNRESOLVED"
    assert m["final_verdict_name"] == "UNRESOLVED"
    assert m["challenge_window"] == 86400


def test_creator_is_recorded_lowercase(env):
    env.create(who=env.bob)
    assert env.market()["creator"] == env.key(env.bob)
    assert env.market()["creator"] == env.market()["creator"].lower()


def test_market_count_and_index(env):
    env.create("a")
    env.create("b")
    assert env.c.get_market_count() == 2
    assert env.c.get_market_id_at(0) == "a"
    assert env.c.get_market_id_at(1) == "b"


def test_index_out_of_range(env):
    env.create()
    with env.vm.expect_revert("index out of range"):
        env.c.get_market_id_at(1)


def test_negative_index(env):
    with env.vm.expect_revert("index out of range"):
        env.c.get_market_id_at(-1)


def test_duplicate_id_rejected(env):
    env.create()
    with env.vm.expect_revert("already exists"):
        env.create()


@pytest.mark.parametrize("bad", ["", "   ", "x" * 65, "a|b"])
def test_invalid_market_ids(env, bad):
    with env.vm.expect_revert("invalid market id"):
        env.create(bad)


def test_max_length_id_accepted(env):
    env.create("x" * 64)
    assert env.c.get_market_count() == 1


@pytest.mark.parametrize("title", ["", "  ", "t" * 201])
def test_invalid_title(env, title):
    with env.vm.expect_revert("invalid title"):
        env.create(title=title)


@pytest.mark.parametrize("spec", ["", "   ", LONG])
def test_invalid_spec(env, spec):
    with env.vm.expect_revert("invalid criteria spec"):
        env.create(spec=spec)


def test_end_in_past_rejected(env):
    with env.vm.expect_revert("must be in the future"):
        env.create(end=env.t0 - 10)


def test_end_equal_now_rejected(env):
    with env.vm.expect_revert("must be in the future"):
        env.create(end=env.t0)


def test_empty_whitelist(env):
    with env.vm.expect_revert("whitelist must hold"):
        env.create(whitelist=[])


def test_oversized_whitelist(env):
    wl = [f"site{i}.com" for i in range(7)]
    with env.vm.expect_revert("whitelist must hold"):
        env.create(whitelist=wl, urls=["https://site0.com/x"])


@pytest.mark.parametrize("bad", ["https://reuters.com", "reuters", "-bad.com", "bad-.com", "a b.com",
                                 "reuters.com/path", ".com", "", "ex*ample.com"])
def test_invalid_whitelist_roots(env, bad):
    with env.vm.expect_revert("invalid whitelist domain"):
        env.create(whitelist=[bad], urls=["https://reuters.com/x"])


def test_whitelist_is_normalised_lowercase_and_deduped(env):
    env.create(whitelist=["Reuters.COM", "reuters.com", " apnews.com "], urls=["https://www.reuters.com/x"])
    assert env.market()["source_whitelist"] == ["reuters.com", "apnews.com"]


def test_requires_at_least_one_url(env):
    with env.vm.expect_revert("source URLs required"):
        env.create(urls=[])


def test_too_many_urls(env):
    urls = [f"https://www.reuters.com/{i}" for i in range(7)]
    with env.vm.expect_revert("source URLs required"):
        env.create(urls=urls)


def test_urls_are_deduped(env):
    env.create(urls=["https://www.reuters.com/a", "https://www.reuters.com/a"])
    assert env.market()["source_urls"] == ["https://www.reuters.com/a"]


def test_source_outside_whitelist_rejected(env):
    with env.vm.expect_revert("not in whitelist"):
        env.create(urls=["https://www.reuters.com/a", "https://evil.example/b"])


def test_http_source_rejected(env):
    with env.vm.expect_revert("not in whitelist"):
        env.create(urls=["http://www.reuters.com/a"])


def test_unknown_market_view_reverts(env):
    with env.vm.expect_revert("unknown market"):
        env.c.get_market("nope")


def test_creation_moves_no_funds(env):
    env.create()
    a = env.acct()
    assert a["total_in"] == 0 and a["invariant_ok"]


def test_many_markets_independent(env):
    for i in range(5):
        env.create(f"m{i}")
    env.bet(env.alice, 1, GEN, "m3")
    assert env.market("m3")["yes_pool"] == GEN
    assert env.market("m2")["yes_pool"] == 0
