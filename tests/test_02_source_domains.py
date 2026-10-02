"""Source mismatch / domain rejection: only https URLs on whitelisted roots may be scraped."""

import pytest

from tests.conftest import OPEN

WL = ["reuters.com", "apnews.com"]


@pytest.mark.parametrize("url", [
    "https://reuters.com/world/x",
    "https://www.reuters.com/world/x",
    "https://a.b.c.reuters.com/x",
    "https://WWW.REUTERS.COM/x",
    "https://apnews.com/article/abc",
    "https://reuters.com./x",
    "https://reuters.com",
    "https://reuters.com/a?b=c#d",
])
def test_allowed_urls(env, url):
    assert env.c.check_url(url, WL) is True


@pytest.mark.parametrize("url", [
    "https://evilreuters.com/x",
    "https://reuters.com.evil.io/x",
    "https://notreuters.com/x",
    "https://reuters.co/x",
    "https://evil.io/reuters.com",
    "https://evil.io/?u=reuters.com",
    "https://reuters.com@evil.io/x",
    "https://evil.io@reuters.com/x",
    "https://reuters.com:8443/x",
    "http://reuters.com/x",
    "ftp://reuters.com/x",
    "javascript:alert(1)",
    "//reuters.com/x",
    "reuters.com/x",
    "",
    "https://",
    "https://reuters.com/a b",
    "https://reuters.com\\@evil.io/",
    "https://reuters.com/\nx",
    "https://" + "a" * 420 + ".reuters.com/",
])
def test_rejected_urls(env, url):
    assert env.c.check_url(url, WL) is False


def test_invalid_root_makes_check_false(env):
    assert env.c.check_url("https://reuters.com/x", ["https://reuters.com"]) is False


def test_create_rejects_lookalike_domain(env):
    with env.vm.expect_revert("not in whitelist"):
        env.create(urls=["https://reuters.com.evil.io/x"])


def test_create_rejects_userinfo_trick(env):
    with env.vm.expect_revert("not in whitelist"):
        env.create(urls=["https://reuters.com@evil.io/x"])


def test_add_source_ok(env):
    env.create(urls=["https://www.reuters.com/a"])
    env.call(env.alice, env.c.add_source, "m1", "https://apnews.com/z")
    assert env.market()["source_urls"] == ["https://www.reuters.com/a", "https://apnews.com/z"]


def test_add_source_domain_mismatch_rejected(env):
    env.create()
    with env.vm.expect_revert("not in whitelist"):
        env.call(env.alice, env.c.add_source, "m1", "https://evil.io/z")


def test_add_source_creator_only(env):
    env.create()
    with env.vm.expect_revert("only the market creator"):
        env.call(env.bob, env.c.add_source, "m1", "https://apnews.com/z")


def test_add_source_duplicate_rejected(env):
    env.create()
    with env.vm.expect_revert("already registered"):
        env.call(env.alice, env.c.add_source, "m1", URLS0)


def test_add_source_limit(env):
    env.create(urls=[f"https://www.reuters.com/{i}" for i in range(6)])
    with env.vm.expect_revert("source limit reached"):
        env.call(env.alice, env.c.add_source, "m1", "https://www.reuters.com/extra")


def test_add_source_after_resolution_rejected(env):
    env.create()
    env.propose()
    with env.vm.expect_revert("market not open"):
        env.call(env.alice, env.c.add_source, "m1", "https://apnews.com/z")


def test_add_source_unknown_market(env):
    with env.vm.expect_revert("unknown market"):
        env.call(env.alice, env.c.add_source, "nope", "https://apnews.com/z")


def test_unwhitelisted_page_is_never_fetched(env):
    """Even if a whitelisted-looking URL is stored, only whitelisted hosts are mocked/fetched."""
    env.create(urls=["https://www.reuters.com/a"])
    env.web_ok()
    env.adjudicate_as(["YES"])
    env.after_end()
    env.call(env.charlie, env.c.propose_resolution, "m1", value=10**17)
    assert env.market()["telemetry"][0]["url"] == "https://www.reuters.com/a"
    assert len(env.market()["telemetry"]) == 1


URLS0 = "https://www.reuters.com/a"
