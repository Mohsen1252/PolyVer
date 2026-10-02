# PolyVerdict — Autonomous Prediction-Market Resolution & Dispute Court

Prediction markets break down at the moment they matter most: a subjective clause, two outlets reporting
different facts, or a centralized oracle that answers late (or not at all). **PolyVerdict** replaces the
oracle with a court that lives on [GenLayer](https://genlayer.com):

1. **Validators scrape** the news sources a market authorised (Reuters, AP, official gazettes, central-bank
   pages…) — and nothing else.
2. Each validator's **LLM takes a stance per source** (`YES` / `NO` / `UNCLEAR`, with a verbatim quote). The
   contract derives the verdict **deterministically** from those stances, so validators agree under GenLayer's
   Equivalence Principle even though their wording differs.
3. Conflicting or inconclusive evidence **never guesses**: it resolves to `AMBIGUOUS_VOID` and every bettor pulls a
   100 % principal refund.
4. An **optimistic bond game** lets anyone contest a verdict inside a 24 h window; a 7-juror panel decides and the
   loser's bond is slashed.

- Network: **GenLayer Studio Next**, chain id `61997` (`0xF22D`)
- RPC: `https://studio-next.genlayer.com/api` · Explorer: <https://explorer-studio-next.genlayer.com>
- Author: SOBEK96 <btcehsan@yahoo.com>

```
contracts/poly_verdict.py   GenVM contract (≈1000 lines)
tests/                      320 direct-mode pytest tests (in-memory GenVM, no network)
scripts/                    deploy.py · interact_live.py · render_readme.py
deployments/studio-next.json  address, bytecode SHA-256, every live tx + validator votes
frontend/                   Vite + React + Tailwind + lucide + viem/genlayer-js "Truth Court" HUD
```

---

## 1. Live deployment (Studio Next)

<!-- CONTRACT:START -->
| Field | Value |
|---|---|
| Network | GenLayer Studio Next, chain id `61997` (`0xF22D`) |
| RPC | `https://studio-next.genlayer.com/api` |
| Contract | [`0xE2062d47d7ce0c8311fDC865D5b8a4dD8cBF3Bf5`](https://explorer-studio-next.genlayer.com/address/0xE2062d47d7ce0c8311fDC865D5b8a4dD8cBF3Bf5) |
| Deployer / governor | `0x27a1Ebe0C137F74D3fbdeF8796B3B5Ad7af45aaa` |
| Bytecode SHA-256 | `a655f4c124f2aba4c5ee3ba6d1808a202de6aef8593ea07609bc70339e5e7700` |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| Deployed | 2026-10-02T12:28:03+00:00 (ISO-8601 UTC, deploy.py clock) |
| Deploy tx | [`0xf456a0de…63ac0c`](https://explorer-studio-next.genlayer.com/transactions/0xf456a0de8cee3e5ada9c725e43f232c963be00d04bd07c27045d7aa5fe63ac0c) |
<!-- CONTRACT:END -->

### Court docket on chain

<!-- CASES:START -->
| Case | Question | Status | Tentative / final verdict | YES pool | NO pool |
|---|---|---|---|---|---|
| #1 `starship-flight-8` | Has SpaceX Starship completed Orbital Test Flight 8? | TENTATIVE_RESOLVED | YES | 0.05 GEN | 0.03 GEN |
| #2A `fed-100bps-sep-2026` | Did the US Federal Reserve cut rates by 100bps in Sep 2026? | TENTATIVE_RESOLVED | AMBIGUOUS_VOID | 0.05 GEN | 0.03 GEN |
| #2B `fed-100bps-sep-2026-primary` | Did the US Federal Reserve cut rates by 100bps in Sep 2026? (primary sources) | TENTATIVE_RESOLVED | NO | 0.05 GEN | 0.03 GEN |
| #3 `country-x-treaty-y-q3` | Did Country X sign Treaty Y by Q3? | TENTATIVE_RESOLVED | AMBIGUOUS_VOID | 0.05 GEN | 0.03 GEN |
| #4 `boe-cut-sep-2026` | Did the Bank of England cut Bank Rate at its September 2026 meeting? | OPEN | UNRESOLVED | 0.05 GEN | 0.03 GEN |
| #5 `starship-flight-8-appeal` | Appeal demo: did Starship Flight 8 take place? (challenge game) | FINALIZED | YES | 0.05 GEN | 0.03 GEN |

Accounting invariant on chain (`get_accounting`): `pool_held + locked_bonds + credits_total + vault == total_in - total_out` → **True** (pool_held 0.4792, locked_bonds 0.4, credits 0.2008, vault 0.1 GEN).
<!-- CASES:END -->

**Live deployments.** The current contract is **v1.2** (address above), seeded live with **25 on-chain transactions**: the four brief
cases (#1 Starship, #2A/#2B Fed, #3 placeholder treaty, #4 pending) plus an appeal demo (#5) that was proposed, challenged with a 0.2 GEN bond
and decided by the 7-juror round. The earlier **v1.1** contract (`0xd4D11029d4DA195dCc3342cF4D677c6B1A16E64C`) is also live and was fully
seeded the same way with **27 on-chain transactions** (24 returned, 3 did not — see the disclosures below); its record is archived in
[`deployments/studio-next.v1.1-seeded.json`](deployments/studio-next.v1.1-seeded.json) and v1.0 in
[`deployments/studio-next.v1-seeded.json`](deployments/studio-next.v1-seeded.json).

**Case #5 on chain (v1.1 and v1.2 behaved identically).** The proposer's `YES` verdict was challenged; the 7-juror round voted `YES` 7–0 and
therefore **upheld the proposer**, so the *challenger's* 0.2 GEN bond was slashed: 0.1 GEN to the proposer and 0.1 GEN to the protocol safety
vault (`get_accounting().vault == 0.1 GEN` on both contracts). Outcomes come from live validators and LLMs and are not perfectly repeatable
between runs; #2A deliberately cites calendar/index pages and fails safe to `AMBIGUOUS_VOID`, while #2B cites the Fed's own statements. Seeded
markets have a 24 h challenge window, so Cases #1–#3 settle only after `finalize_resolution`.

### On-chain proofs

Every transaction below was sent by `scripts/interact_live.py` / `scripts/deploy.py`; "Validators agree" counts
`agree` votes in the consensus round (Studio Next runs 5 validators; late validators are cancelled `idle` once quorum
is reached, which is normal).

<!-- PROOFS:START -->
| # | Action | Market | Consensus | Validators agree | Transaction |
|---|---|---|---|---|---|
| 0 | deploy contract | — | — | — | [`0xf456a0de…63ac0c`](https://explorer-studio-next.genlayer.com/transactions/0xf456a0de8cee3e5ada9c725e43f232c963be00d04bd07c27045d7aa5fe63ac0c) |
| 1 | case-1: create market | `starship-flight-8` | MAJORITY_AGREE | 3/5 | [`0x7bf27908…91f020`](https://explorer-studio-next.genlayer.com/transactions/0x7bf279089965419b223fba3db7d9634c8011204256d51b65b36b8de9ac91f020) |
| 2 | case-2a: create market | `fed-100bps-sep-2026` | MAJORITY_AGREE | 3/5 | [`0x9b4bb756…94b2ac`](https://explorer-studio-next.genlayer.com/transactions/0x9b4bb756956025540c5f8af35b53b71ae983eef386276589d7afeaa62194b2ac) |
| 3 | case-2b: create market | `fed-100bps-sep-2026-primary` | MAJORITY_AGREE | 4/5 | [`0xd7f60fa8…0dcdd0`](https://explorer-studio-next.genlayer.com/transactions/0xd7f60fa84c6148fcf9aa6c7cef7ee1a836d2c433e3bfa881c8a911bf650dcdd0) |
| 4 | case-3: create market | `country-x-treaty-y-q3` | MAJORITY_AGREE | 3/5 | [`0xd07a7129…133c11`](https://explorer-studio-next.genlayer.com/transactions/0xd07a71292b879cd62ec9390398ab845e11489c49e7924d6c3c0fe1778b133c11) |
| 5 | case-4: create market | `boe-cut-sep-2026` | MAJORITY_AGREE | 3/5 | [`0x1726215e…ef0b0a`](https://explorer-studio-next.genlayer.com/transactions/0x1726215e9f57b1a9cfaa70edb8027f787d88169f00300fdd983d92aeb0ef0b0a) |
| 6 | case-5: create market | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x617f92b5…6b58d0`](https://explorer-studio-next.genlayer.com/transactions/0x617f92b516b1b3e890b65204381d2e68248419f34dce07854269663ce76b58d0) |
| 7 | case-1: bet YES | `starship-flight-8` | MAJORITY_AGREE | 3/5 | [`0x0e15e1ca…ae9bbc`](https://explorer-studio-next.genlayer.com/transactions/0x0e15e1cabf95d719d01922c881dc482cbbc4f8d8f5ad020b861c747849ae9bbc) |
| 8 | case-1: bet NO | `starship-flight-8` | MAJORITY_AGREE | 4/5 | [`0x5b0a7357…5f4960`](https://explorer-studio-next.genlayer.com/transactions/0x5b0a735724f73259c2672e8d45453431da1512451c2aabf3030c1528125f4960) |
| 9 | case-2a: bet YES | `fed-100bps-sep-2026` | MAJORITY_AGREE | 3/5 | [`0x3f234f16…21d322`](https://explorer-studio-next.genlayer.com/transactions/0x3f234f16ae40f54740f1cce6d4419f16c3b8b33efcd8d6a2992cda346621d322) |
| 10 | case-2a: bet NO | `fed-100bps-sep-2026` | MAJORITY_AGREE | 3/5 | [`0x9ecb35cf…f5d09d`](https://explorer-studio-next.genlayer.com/transactions/0x9ecb35cf196acaf7dc5d041fefad80c2d64fe1cc5e4334844119936e10f5d09d) |
| 11 | case-2b: bet YES | `fed-100bps-sep-2026-primary` | MAJORITY_AGREE | 3/5 | [`0x97f57487…47f6a2`](https://explorer-studio-next.genlayer.com/transactions/0x97f574879be1fd5520a2476220fd8fe5db22bf34b07f463252b971297647f6a2) |
| 12 | case-2b: bet NO | `fed-100bps-sep-2026-primary` | MAJORITY_AGREE | 3/5 | [`0xf8960233…54b15d`](https://explorer-studio-next.genlayer.com/transactions/0xf8960233d4279316881ed163c48abcc9ed4030da1f6cb3ad87f8cf636154b15d) |
| 13 | case-3: bet YES | `country-x-treaty-y-q3` | MAJORITY_AGREE | 3/5 | [`0xc431135b…326ade`](https://explorer-studio-next.genlayer.com/transactions/0xc431135b32836131362271d0357112e3d8c44f9288b9491b3d802d6a7a326ade) |
| 14 | case-3: bet NO | `country-x-treaty-y-q3` | MAJORITY_AGREE | 3/5 | [`0x61508119…25ab7b`](https://explorer-studio-next.genlayer.com/transactions/0x61508119aff4fe40cb632c20884e8d25b4f89b89a5ddfbc549ad64068025ab7b) |
| 15 | case-4: bet YES | `boe-cut-sep-2026` | MAJORITY_AGREE | 3/5 | [`0xbaa22b85…9b0581`](https://explorer-studio-next.genlayer.com/transactions/0xbaa22b85ba37556d2f118bcef331f403c9ee06c558e2f256fa866bffc99b0581) |
| 16 | case-4: bet NO | `boe-cut-sep-2026` | MAJORITY_AGREE | 3/5 | [`0xa84fda2b…c46194`](https://explorer-studio-next.genlayer.com/transactions/0xa84fda2b84a1dd5f10a0a265537af9d227c29ed9cbee1a0d8edf328ea4c46194) |
| 17 | case-5: bet YES | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x01ae68ae…1bccca`](https://explorer-studio-next.genlayer.com/transactions/0x01ae68aeaca1aa79943b0e867d921c185fd974e54e1e161c1ac4a19cfb1bccca) |
| 18 | case-5: bet NO | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x9396356c…cb62fd`](https://explorer-studio-next.genlayer.com/transactions/0x9396356cccd07987c03dc5f66619d8460c9fdccc54681a8c8474b0539ccb62fd) |
| 19 | case-1: propose resolution | `starship-flight-8` | MAJORITY_AGREE | 3/5 | [`0xe2a2d4a4…6c416f`](https://explorer-studio-next.genlayer.com/transactions/0xe2a2d4a40e73f41c55936511be6b884259342dd34547eca4c6fd2c18b16c416f) |
| 20 | case-2a: propose resolution | `fed-100bps-sep-2026` | MAJORITY_AGREE | 3/5 | [`0x06a1c880…f3cd07`](https://explorer-studio-next.genlayer.com/transactions/0x06a1c880ed405356ed0fbf3774c9a21951bd8a55ab99e92f1cc3be9b58f3cd07) |
| 21 | case-2b: propose resolution | `fed-100bps-sep-2026-primary` | MAJORITY_AGREE | 3/5 | [`0xbdbc0ef9…bf350e`](https://explorer-studio-next.genlayer.com/transactions/0xbdbc0ef9a03c4cc173d7465e8d0a88849f03b9c56180c6114e2119be45bf350e) |
| 22 | case-3: propose resolution | `country-x-treaty-y-q3` | MAJORITY_AGREE | 3/5 | [`0xde1ef42a…a0c9ce`](https://explorer-studio-next.genlayer.com/transactions/0xde1ef42ae9d96dcf371f0df5ce006cc87107cbb62c7e037cc1f237059ba0c9ce) |
| 23 | case-5: propose resolution | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x9f955df7…35720b`](https://explorer-studio-next.genlayer.com/transactions/0x9f955df7986d1895aa613192b995ecfe78592f4f0db15f7377a1c576ca35720b) |
| 24 | challenge verdict (starship-flight-8-appeal) | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x0f57a675…db7d95`](https://explorer-studio-next.genlayer.com/transactions/0x0f57a675de0a79e069421d4a14aa1613c6affb4569f53fbb14ff00cb86db7d95) |
| 25 | convene jury (starship-flight-8-appeal) | `starship-flight-8-appeal` | MAJORITY_AGREE | 3/5 | [`0x3674a36f…09a490`](https://explorer-studio-next.genlayer.com/transactions/0x3674a36f87026c2becbb59b0388aba7fa5582940c40c532f4fa33af19009a490) |
<!-- PROOFS:END -->

### Live Consensus & Execution Disclosures

Taken from the archived deployment records; nothing here is edited out of the proofs.

* **v1.2 (current):** all 25 transactions finished with a return and `MAJORITY_AGREE`; no retries and no reverts.
* **v1.1, Market #1 consensus retries.** Proposing the resolution of `starship-flight-8` took **three** attempts (tx #19, #20, #21). The first
  two ended `MAJORITY_DISAGREE` / `FINISHED_WITH_ERROR` (0 of 5 validators agreed) and the third reached `MAJORITY_AGREE`. For the first attempt the
  leader's result was `[TRANSIENT] sources temporarily unavailable`, i.e. the live web read failed; the contract is designed to revert on that
  rather than guess. I did not individually inspect the second attempt's receipt, so its cause is presumed to be the same live-web variance.
* **v1.1, Market #5 NO bet.** The `NO` stake on `starship-flight-8-appeal` (tx #18) finished `FINISHED_WITH_ERROR`; the pool is therefore
  one-sided (0.05 GEN YES, 0 NO). It was submitted after the market's betting window had elapsed (the seed run had been slowed by RPC rate
  limiting; the follow-up run logged "betting window closed"). The exact revert text was not captured. In v1.2 both stakes landed (0.05 / 0.03).
* **Timestamps.** `deployed_at` in the deployment table is **ISO-8601 in UTC** (offset `+00:00`), taken from the deploying machine's clock when
  `scripts/deploy.py` recorded the contract; it is not a block timestamp.

---

## 2. State machine

```
                       place_prediction (payable, before end_timestamp)
                              ┌──────────┐
                              ▼          │
   create_market ────────► OPEN ─────────┘
                              │
          now ≥ end_timestamp │ propose_resolution  (+0.1 GEN bond, validator consensus)
                              ▼
                    TENTATIVE_RESOLVED  ──── challenge_deadline = now + 24h
                       │            │
   24h elapsed,        │            │ challenge_verdict (+0.2 GEN bond, within window)
   no challenge        │            ▼
   finalize_resolution │         DISPUTED ── resolve_disputed_market (7-juror panel, 5/7 quorum)
                       │            │
                       ▼            ▼
              FINALIZED  (YES/NO verdict, pool fee paid)         VOIDED (AMBIGUOUS_VOID verdict,
                       │                                          or empty winning side → 100 % refund)
                       └──────────── claim_payout (pull) ─────────────┘

   OPEN ──(30 days past end, nobody resolved)── void_stale_market ──► VOIDED
```

`RESOLVING` exists in the status enum for the in-transaction phase of `propose_resolution`; the consensus round is
atomic inside that call, so it is never visible between transactions.

## 3. Verdict derivation (Equivalence Principle)

Each validator independently fetches every authorised URL and prompts its LLM for a stance per source. The leader's
result is accepted only if each validator's *own* derived outcome equals the leader's — free-text reasoning may differ.

| Rule (evaluated in order) | Result |
|---|---|
| no source readable, all failures transient (5xx / 429) | transaction reverts `[TRANSIENT]` and is retried |
| no source readable, otherwise (404…) | `AMBIGUOUS_VOID` |
| any `YES` **and** any `NO` among sources | `AMBIGUOUS_VOID` (conflict) |
| definitive sources `< min(2, readable)` | `AMBIGUOUS_VOID` (lacks corroboration) |
| LLM confidence `< 60` | `AMBIGUOUS_VOID` |
| LLM overall verdict ≠ unanimous stance | `AMBIGUOUS_VOID` |
| otherwise | unanimous stance: `YES` or `NO` |

Deterministic guards: no resolution before `end_timestamp`; only `https` URLs whose host equals a whitelisted root or is
a true subdomain of it (`evilreuters.com`, `reuters.com.evil.io`, `https://reuters.com@evil.io`, ports and look-alike
schemes are all rejected); page text is stripped of scripts/navigation and every prompt delimiter is neutralised before
it reaches the model.

## 4. Slashing game & payout mathematics

Bonds: proposer $B_p = 0.1$ GEN, challenger $B_c = 0.2$ GEN. The side the 7-juror panel rules **against** loses its bond:

$$
B_{slashed} = \begin{cases} B_c & \text{panel upholds the proposer} \\ B_p & \text{panel overturns the proposer} \end{cases}
$$

$$
\text{to winner} = \left\lfloor \tfrac{B_{slashed}}{2} \right\rfloor ,\qquad
\text{to safety vault} = B_{slashed} - \left\lfloor \tfrac{B_{slashed}}{2} \right\rfloor
$$

| Outcome | Winner receives | Vault | Loser |
|---|---|---|---|
| proposer upheld | $B_p + 0.05 + \text{fee}$ = bond back + half of $B_c$ + fee | $0.10$ | $-B_c$ (0.2 GEN) |
| challenger upheld | $B_c + 0.05 + \text{fee}$ = bond back + half of $B_p$ + fee | $0.05$ | $-B_p$ (0.1 GEN) |
| uncontested, finalized | proposer: $B_p + \text{fee}$ | — | — |

The pool fee goes to whoever was right. With $P = P_{yes} + P_{no}$ and $W$ the winning side's pool:

$$
\text{fee} = \left\lfloor \tfrac{P \cdot 100}{10\,000} \right\rfloor ,\qquad
D = P - \text{fee},\qquad
\text{payout}_i = \left\lfloor \tfrac{stake_i \cdot D}{W} \right\rfloor
$$

`AMBIGUOUS_VOID`, or a verdict whose winning side holds no stake, charges **no fee** and refunds $payout_i = principal_i$.
Rounding dust is strictly less than one wei per winner and stays in the pool; $\sum_i \text{payout}_i \le D$ always.

**Accounting invariant** (checked by tests after every step and readable on chain via `get_accounting`):

$$
\underbrace{pool\_held + locked\_bonds + credits\_total + vault}_{\text{tracked liabilities}} \;=\; total\_in - total\_out
$$

Payouts follow checks-effects-interactions: the claim flag and counters are updated *before* `emit_transfer` is queued, and
rolled back if queueing raises (`test_failed_transfer_rolls_back_claim`).

## 5. Contract API

| Method | Kind | Purpose |
|---|---|---|
| `create_market(id, title, criteria_spec, source_whitelist, source_urls, end_timestamp)` | write | permissionless registry; validates domains |
| `add_source(id, url)` | write | creator adds a whitelisted URL while `OPEN` |
| `place_prediction(id, outcome)` | **payable** | `1`=YES, `2`=NO stake |
| `propose_resolution(id)` | **payable 0.1 GEN** | scrape + LLM consensus → `TENTATIVE_RESOLVED` |
| `challenge_verdict(id)` | **payable 0.2 GEN** | flips to `DISPUTED` inside the window |
| `resolve_disputed_market(id)` | write | 7-juror round, bond slashing, final verdict |
| `finalize_resolution(id)` | write | closes an uncontested verdict after 24 h |
| `claim_payout(id)` | write | pull winnings / full refund |
| `withdraw_credits()` | write | pull bond returns, slashing rewards, fees |
| `void_stale_market(id)` | write | 30-day safety valve |
| `void_stale_disputed_market(id)` | write | voids a market disputed for 7+ days, returns both bonds |
| `withdraw_vault(to, amount)` | write | governor-only safety-vault withdrawal |
| `get_market` · `get_jury_verdict` · `can_challenge` · `can_finalize` · `quote_payout` · `get_position` · `get_accounting` · `get_constants` · `credits_of` · `check_url` | view | |

Enums: outcome `UNRESOLVED=0 YES=1 NO=2 AMBIGUOUS_VOID=3`; status `OPEN=0 RESOLVING=1 TENTATIVE_RESOLVED=2 DISPUTED=3 FINALIZED=4 VOIDED=5`.
`source_whitelist` / `source_urls` are stored as JSON strings internally (avoids nested-storage pitfalls) and returned as lists.

## 6. Running it

```bash
# tests — 320 tests, in-memory GenVM, parallel
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python genlayer-test==0.30.0rc2 genlayer-py==0.19.0rc2 python-dotenv requests pytest pytest-xdist
.venv/bin/python -m pytest                 # add -n0 to run serially
genvm-lint check contracts/poly_verdict.py

# live (Studio Next)
.venv/bin/python scripts/deploy.py                    # key -> .env (mode 600), sim_fundAccount, deploy, record
.venv/bin/python scripts/interact_live.py seed        # create + bet + resolve the court cases
.venv/bin/python scripts/interact_live.py status
.venv/bin/python scripts/interact_live.py finalize    # after the 24 h window
.venv/bin/python scripts/interact_live.py claim
.venv/bin/python scripts/render_readme.py             # refresh the generated README tables

# frontend
cd frontend && npm install && npm run build && npm run console-check
npm run dev
```

`.env` holds a throw-away **testnet** key (git-ignored, `chmod 600`); testnet GEN has no value. Studio Next has no on-chain
fee manager, so scripts read the live fee policy and pass an explicit fee distribution with every transaction (~0.1 GEN deposit).

## 7. Verification status

<!-- VERIFY:START -->
| Check | Result |
|---|---|
| `pytest` (direct mode) | **320 passed** |
| `genvm-lint check contracts/poly_verdict.py` | **Lint passed, validation passed** (24 methods: 13 view, 11 write) |
| `npm run build` (`tsc -b && vite build`) | **0 TypeScript / bundle errors** |
| `node frontend/scripts/console-check.mjs` | **PASS — zero console errors** loading the live contract (navbar 64 px, Protocol drawer opened; Evidence Room verified on the seeded v1.0 docket) |

![docket](docs/docket.png)
![evidence room](docs/evidence-room.png)
<!-- VERIFY:END -->

## 8. Limitations & oracle trust assumptions

PolyVerdict reduces — it does not remove — trust. Read these before putting value behind it.

* **Validators and their LLMs are the oracle.** A verdict is as good as the honest majority of Studio Next validators and the
  models they run. Models can be wrong, biased, or manipulated by page content; the contract limits this (stance-per-source,
  deterministic derivation, delimiter neutralisation, corroboration rule) but cannot eliminate it.
* **A web page is only as truthful as its publisher.** Whitelisting a domain trusts its editorial process. The market creator
  chooses the whitelist and URLs — bettors must vet them *before* staking; a creator can pick sources biased toward an outcome.
* **Redirects are not observable.** `gl.nondet.web.get` follows redirects but does not expose the final host, so a whitelisted
  URL that redirects off-domain is still read. Validators agree on content, not provenance.
* **Single unread source rule.** If a market has two or more sources but fewer than two could be read (HTTP 2xx), the verdict falls back to
  `AMBIGUOUS_VOID`; one surviving page is not trusted to decide a multi-source market. If every failure is transient (5xx/429) the call reverts for retry instead.
* **Source immutability.** Sources are frozen by the very first prediction (and by `end_timestamp`): `add_source` reverts with
  `ERR_MARKET_ALREADY_ACTIVE` afterwards, so a creator cannot change evidence once money is at stake. Bettors must vet sources *before* staking.
* **Stale disputes.** A `DISPUTED` market is voided by anyone after 7 days (`void_stale_disputed_market`); until then only `resolve_disputed_market` can settle it.
* **Consensus compares outcomes only.** Validators agree if their derived outcome matches; the leader's reasoning text and quotes are
  stored but not individually verified.
* **Jury implementation (disclosure).** The 7-juror Supreme Court round runs as a *structured multi-perspective prompt* inside the GenVM validator
  consensus round — it is **not** seven isolated, separately staked validator contracts. See the next bullet for detail.
* **The "7-juror panel" is one structured LLM call.** The contract cannot choose the validator count (the network sets it). The jury is a
  single prompt in which seven lenses each cast a ballot that the contract tallies deterministically (5-of-7 quorum); independence
  comes from every validator re-executing it, not from seven separate models. Appeals through GenLayer's native appeal rounds are
  outside this contract.
* **Economic security is thin.** Bonds (0.1 / 0.2 GEN) are fixed and unrelated to pool size. A large pool can out-bid them: a bribed
  or self-challenging attacker with two accounts (`proposer ≠ challenger` is the only check) can grief or attempt to steer verdicts
  when stakes dwarf bonds. Bonds should scale with pool size before real-money use.
* **Time is block time.** Deadlines use the transaction timestamp; the 24 h window is approximate to block production.
* **Transfers settle asynchronously.** `emit_transfer(on="finalized")` can fail *after* the enqueue succeeded; the rollback guard only
  covers enqueue-time failures.
* **Dust and fees.** Division dust (< 1 wei per winner) is never swept; the 1 % fee is not configurable.
* **Tests run against mocks.** The 320 direct-mode tests exercise leader logic and validator comparison with mocked web/LLM replies.
  Real-network behaviour is evidenced only by the live transactions above (which are few and Studio Next is a resettable testnet).
* **Frontend writes are unverified end-to-end.** Reads were verified against the live contract (zero console errors); the wallet
  paths (`place_prediction`, `challenge_verdict`, …) are implemented against `genlayer-js 2.0.0-rc.1` but were **not** exercised with a real
  browser wallet. The 1.1.8 release of `genlayer-js` is incompatible with Studio Next (`malformed_entry`), hence the rc pin.
* **Cosmetic extraction limits.** Page text comes from regex tag-stripping, not a DOM parser; boilerplate-heavy pages spend part of the
  3,500-char per-source budget on navigation, and the contract cannot render JavaScript-only pages.
* **Real-world cases depend on what pages said when scraped** and on the clause wording; a clause worded differently can resolve
  differently.


## 9. Audit hardening (v1.1 / v1.2)

| Finding | Fix |
|---|---|
| Disputed market could lock up forever if nobody convened the jury | `challenge_verdict` stores `disputed_at`; after `DISPUTE_STALE_WINDOW = 7 days` anyone may call `void_stale_disputed_market`: both bonds return to their owners' credits, the market voids and all bettors can claim 100 % principal. Counters (`locked_bonds`, `credits_total`, `pool_held`) stay balanced. |
| Creator could swap sources after bets were placed | `add_source` reverts with `ERR_MARKET_ALREADY_ACTIVE` once any stake exists or `end_timestamp` has passed. |
| Single readable source decided multi-source markets | `_derive_outcome`: a market with ≥ 2 sources where fewer than 2 returned HTTP 2xx fails safe to `AMBIGUOUS_VOID`. |
| Single-domain quorum bypass (two paths on one site counted as two sources) | Quorum counts **distinct domains** (`_domain_of`: lower-cased host, leading `www.` removed). A market spanning ≥ 2 domains needs ≥ 2 distinct domains read *and* ≥ 2 distinct domains with a definitive stance; otherwise `AMBIGUOUS_VOID`. Single-domain markets (e.g. Fed primary documents) can resolve on that one domain. |
| Jury could decide YES/NO on one readable domain | `_convene_jury` applies the same read quorum: ≥ 2 configured domains but < 2 readable → unanimous `VOID` ballot without consulting the LLM. |
