"""Shared helpers for the PolyVerdict deployment / live-interaction scripts.

* Key management: a local key is derived/generated once and kept in `.env`
  (git-ignored, mode 600). It is a throwaway Studio Next testnet key.
* Funding: Studio Next exposes `sim_fundAccount`; no faucet or wallet needed.
* Client: genlayer-py client pointed at Studio Next (chain id 61997).
"""

import hashlib
import json
import os
import stat
import sys
import time
from copy import deepcopy
from pathlib import Path

import requests
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studio_devnet

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
CONTRACT_PATH = ROOT / "contracts" / "poly_verdict.py"
DEPLOYMENT_PATH = ROOT / "deployments" / "studio-next.json"

RPC_URL = "https://studio-next.genlayer.com/api"
EXPLORER_URL = "https://explorer-studio-next.genlayer.com"
CHAIN_ID = 61997
GEN = 10**18
FUND_AMOUNT_GEN = 10


def ensure_key() -> str:
    """Return the private key from .env, generating and persisting one if absent."""
    load_dotenv(ENV_PATH)
    key = os.environ.get("POLYVERDICT_PRIVATE_KEY")
    if key:
        return key
    acct = Account.create()
    key = "0x" + acct.key.hex().removeprefix("0x")
    existing = ENV_PATH.read_text() if ENV_PATH.exists() else ""
    ENV_PATH.write_text(existing + f"POLYVERDICT_PRIVATE_KEY={key}\n")
    os.chmod(ENV_PATH, stat.S_IRUSR | stat.S_IWUSR)  # 600
    os.environ["POLYVERDICT_PRIVATE_KEY"] = key
    print(f"generated new key for {acct.address} -> .env (mode 600)")
    return key


def account(key: str | None = None):
    return Account.from_key(key or ensure_key())


def rpc(method: str, params: list):
    r = requests.post(RPC_URL, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60)
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def balance_wei(address: str) -> int:
    return int(rpc("eth_getBalance", [address, "latest"]), 16)


def fund(address: str, gen: int = FUND_AMOUNT_GEN) -> int:
    rpc("sim_fundAccount", [address, gen * GEN])
    return balance_wei(address)


def ensure_funded(address: str, minimum_gen: float = 2.0) -> int:
    bal = balance_wei(address)
    if bal < int(minimum_gen * GEN):
        bal = fund(address)
        print(f"funded {address} via sim_fundAccount -> {bal / GEN:.4f} GEN")
    return bal


def make_client(acct=None):
    chain = deepcopy(studio_devnet)
    chain.rpc_urls["default"]["http"] = [RPC_URL]
    chain.block_explorers["default"]["url"] = EXPLORER_URL
    client = create_client(chain=chain, endpoint=RPC_URL, account=acct or account())
    assert client.w3.eth.chain_id == CHAIN_ID, "unexpected chain id"
    return client


def source_sha256() -> str:
    return hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()


def load_deployment() -> dict:
    if not DEPLOYMENT_PATH.exists():
        sys.exit("no deployments/studio-next.json - run scripts/deploy.py first")
    return json.loads(DEPLOYMENT_PATH.read_text())


def save_deployment(data: dict) -> None:
    DEPLOYMENT_PATH.parent.mkdir(exist_ok=True)
    DEPLOYMENT_PATH.write_text(json.dumps(data, indent=2) + "\n")


def tx_url(tx_hash: str) -> str:
    return f"{EXPLORER_URL}/transactions/{tx_hash}"


def chain_now() -> int:
    """Wall-clock UTC seconds. Studio Next stamps each transaction with the wall clock
    at execution (blocks are only produced on activity, so the latest block timestamp
    lags and cannot be used to wait for a deadline)."""
    return int(time.time())


def wait_for_chain_time(ts: int, poll: float = 5.0, margin: int = 20) -> None:
    while chain_now() <= ts + margin:
        time.sleep(poll)


_FEE_CACHE: dict = {}


def fees(client) -> dict:
    """Fee deposit for one transaction. Studio Next has no on-chain FeeManager, so the
    SDK cannot derive the deposit itself ("FeesDistributionMissing"); the live fee
    policy is read and passed explicitly."""
    if not _FEE_CACHE or time.time() - _FEE_CACHE["at"] > 120:  # the RPC is rate limited; the policy rarely changes
        est = client.estimate_transaction_fees()
        _FEE_CACHE.update(at=time.time(), value={"distribution": est["distribution"], "feeValue": est["feeValue"]})
    return _FEE_CACHE["value"]
