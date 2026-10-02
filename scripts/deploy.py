"""Deploy contracts/poly_verdict.py to GenLayer Studio Next (chain 61997).

    .venv/bin/python scripts/deploy.py

Auto-derives a local key in .env, funds it via sim_fundAccount, deploys, and
records the contract address, SHA-256 of the deployed code and the deploy
transaction hash in deployments/studio-next.json.
"""

import hashlib
import re
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
import _common as c  # noqa: E402


def main() -> None:
    acct = c.account()
    c.ensure_funded(acct.address)
    client = c.make_client(acct)

    code = c.CONTRACT_PATH.read_bytes()
    runner = re.search(r'"Depends":\s*"([^"]+)"', code.decode())
    print(f"deploying {c.CONTRACT_PATH.name} ({len(code)} bytes) as {acct.address}")
    tx_hash = client.deploy_contract(code=code, account=acct, args=[], fees=c.fees(client))
    print(f"deploy tx: {tx_hash}\n  {c.tx_url(tx_hash)}")
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash, retries=200, interval=3000)
    address = _contract_address(receipt)
    if not address:
        sys.exit(f"could not read contract address from receipt: {receipt}")
    print(f"contract: {address}")

    c.save_deployment({
        "network": "studio-next",
        "chain_id": c.CHAIN_ID,
        "rpc_url": c.RPC_URL,
        "contract_address": address,
        "explorer_url": f"{c.EXPLORER_URL}/address/{address}",
        "source": "contracts/poly_verdict.py",
        "runner": runner.group(1) if runner else None,
        "bytecode_sha256": hashlib.sha256(code).hexdigest(),
        "deployer": acct.address,
        "deployed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "deploy_tx": {"hash": tx_hash, "url": c.tx_url(tx_hash)},
        "cases": {},
        "transactions": [],
    })
    print("recorded -> deployments/studio-next.json")

    # Sanity-read straight from chain (best effort: the shared RPC can answer "server busy").
    for attempt in range(8):
        try:
            constants = client.read_contract(address=address, function_name="get_constants", args=[], account=acct)
            print("get_constants ->", constants)
            break
        except Exception as e:  # noqa: BLE001
            print(f"  read retry {attempt + 1}: {str(e)[:90]}")
            time.sleep(5 * (attempt + 1))


def _contract_address(receipt) -> str | None:
    """The receipt shape differs between simulator and hosted networks; check all of them."""
    def get(obj, *path):
        for p in path:
            if obj is None:
                return None
            obj = obj.get(p) if isinstance(obj, dict) else getattr(obj, p, None)
        return obj

    for path in (("data", "contract_address"), ("tx_data_decoded", "contract_address"),
                 ("to_address",), ("recipient",), ("contract_address",)):
        v = get(receipt, *path)
        if isinstance(v, str) and v.startswith("0x") and int(v, 16) != 0:
            return v
    return None


if __name__ == "__main__":
    main()
