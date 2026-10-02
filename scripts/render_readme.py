"""Fill the generated sections of README.md from deployments/studio-next.json + live chain state.

    .venv/bin/python scripts/render_readme.py

Sections between <!-- X:START --> and <!-- X:END --> markers are replaced; everything else is
hand-written. Nothing in the proofs/cases tables is typed by hand.
"""

import re
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
import _common as c  # noqa: E402

README = c.ROOT / "README.md"
OUT = {"ambiguous": "AMBIGUOUS_VOID"}


def gen(v) -> str:
    return f"{int(v) / c.GEN:.4f}".rstrip("0").rstrip(".") if int(v) else "0"


def short(h: str) -> str:
    return f"`{h[:10]}…{h[-6:]}`"


def replace(text: str, name: str, body: str) -> str:
    pat = re.compile(rf"(<!-- {name}:START -->)(.*?)(<!-- {name}:END -->)", re.S)
    if not pat.search(text):
        sys.exit(f"marker {name} missing in README.md")
    return pat.sub(lambda m: f"{m.group(1)}\n{body}\n{m.group(3)}", text)


def contract_block(d: dict) -> str:
    return "\n".join([
        "| Field | Value |", "|---|---|",
        f"| Network | GenLayer Studio Next, chain id `{d['chain_id']}` (`0xF22D`) |",
        f"| RPC | `{d['rpc_url']}` |",
        f"| Contract | [`{d['contract_address']}`]({d['explorer_url']}) |",
        f"| Deployer / governor | `{d['deployer']}` |",
        f"| Bytecode SHA-256 | `{d['bytecode_sha256']}` |",
        f"| Runner | `{d['runner']}` |",
        f"| Deployed | {d['deployed_at']} |",
        f"| Deploy tx | [{short(d['deploy_tx']['hash'])}]({d['deploy_tx']['url']}) |",
    ])


def proofs_block(d: dict) -> str:
    rows = ["| # | Action | Market | Consensus | Validators agree | Transaction |", "|---|---|---|---|---|---|",
            f"| 0 | deploy contract | — | — | — | [{short(d['deploy_tx']['hash'])}]({d['deploy_tx']['url']}) |"]
    for i, t in enumerate(d.get("transactions", []), 1):
        rows.append(f"| {i} | {t['label']} | `{t.get('market_id') or '—'}` | {t.get('result_name') or '—'} "
                    f"| {t.get('agree', '—')}/{t.get('total', '—')} | [{short(t['hash'])}]({t['url']}) |")
    return "\n".join(rows)


def cases_block(d: dict) -> str:
    client = c.make_client()
    acct = c.account()
    addr = d["contract_address"]
    rows = ["| Case | Question | Status | Tentative / final verdict | YES pool | NO pool |", "|---|---|---|---|---|---|"]
    n = client.read_contract(address=addr, function_name="get_market_count", args=[], account=acct)
    for i in range(n):
        mid = client.read_contract(address=addr, function_name="get_market_id_at", args=[i], account=acct)
        m = client.read_contract(address=addr, function_name="get_market", args=[mid], account=acct)
        verdict = m["final_verdict_name"] if m["final_verdict"] else m["proposed_outcome_name"]
        label = next((k.replace("case-", "#").upper() for k, v in d.get("cases", {}).items() if v["market_id"] == mid), "#?")
        rows.append(f"| {label} `{mid}` | {m['title']} | {m['status_name']} | {verdict} "
                    f"| {gen(m['yes_pool'])} GEN | {gen(m['no_pool'])} GEN |")
    acc = client.read_contract(address=addr, function_name="get_accounting", args=[], account=acct)
    rows += ["", f"Accounting invariant on chain (`get_accounting`): `pool_held + locked_bonds + credits_total + vault == "
             f"total_in - total_out` → **{acc['invariant_ok']}** "
             f"(pool_held {gen(acc['pool_held'])}, locked_bonds {gen(acc['locked_bonds'])}, "
             f"credits {gen(acc['credits_total'])}, vault {gen(acc['vault'])} GEN)."]
    return "\n".join(rows)


def main():
    d = c.load_deployment()
    text = README.read_text()
    text = replace(text, "CONTRACT", contract_block(d))
    text = replace(text, "PROOFS", proofs_block(d))
    text = replace(text, "CASES", cases_block(d))
    README.write_text(text)
    print("README.md updated")


if __name__ == "__main__":
    main()
