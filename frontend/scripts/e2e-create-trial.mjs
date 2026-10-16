// Live end-to-end proof of the frontend trial-creation path on GenLayer Studio Next (chain 61997).
//   npm run build && npm run e2e:create-trial
//
// 1. Generates a fresh throwaway wallet key and funds it through Studio's `sim_fundAccount`.
// 2. Serves the production build (`vite preview`) and drives it with headless Chrome (puppeteer-core).
// 3. Injects a real EIP-1193 provider as `window.ethereum`. It behaves like MetaMask: the page asks it to
//    `eth_sendTransaction`; the provider signs with the wallet key in Node and broadcasts via
//    `eth_sendRawTransaction`. The page code itself is untouched: genlayer-js builds the consensus calldata + fees.
// 4. Clicks through Connect Wallet -> Create Prediction Trial -> fills the form -> Create trial.
// 5. Waits for the UI to report ACCEPTED/FINALIZED + FINISHED_WITH_RETURN, then reads the trial back
//    independently from the contract and writes deployments/verification.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const PORT = 4175;
const URL_ = `http://localhost:${PORT}/`;
const RPC = "https://studio-next.genlayer.com/api";
const EXPLORER = "https://explorer-studio-next.genlayer.com";
const CHAIN_ID = 61997;
const deployment = JSON.parse(readFileSync(new URL("../../deployments/studio-next.json", import.meta.url), "utf8"));
const CONTRACT = deployment.contract_address;
const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!CHROME) throw new Error("No Chrome found. Set CHROME_PATH.");
if (!existsSync("dist/index.html")) throw new Error("dist/ missing - run `npm run build` first.");

async function rpc(method, params) {
  // The public RPC rate-limits (HTML 429/502 or "busy" errors): back off and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      const text = await r.text();
      const body = JSON.parse(text);
      if (body.error) throw Object.assign(new Error(body.error.message ?? JSON.stringify(body.error)), { code: body.error.code, data: body.error });
      return body.result;
    } catch (e) {
      const transient = e instanceof SyntaxError || /busy|rate|too many|fetch failed/i.test(String(e.message));
      if (!transient || attempt >= 8) throw e;
      await sleep(5000 + attempt * 5000);
    }
  }
}

// ---- the wallet (lives in Node, exactly like a browser extension's key store) ----
const key = process.env.E2E_PRIVATE_KEY || generatePrivateKey();
const wallet = privateKeyToAccount(key);
const walletLog = [];
async function walletRequest(method, params = []) {
  walletLog.push(method);
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts":
      return [wallet.address];
    case "eth_chainId":
      return "0xf22d";
    case "net_version":
      return String(CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null;
    case "eth_sendTransaction": {
      const tx = params[0];
      const signed = await wallet.signTransaction({
        type: "legacy",
        chainId: CHAIN_ID,
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        gas: BigInt(tx.gas),
        gasPrice: BigInt(tx.gasPrice),
        nonce: Number(BigInt(tx.nonce)),
      });
      const hash = await rpc("eth_sendRawTransaction", [signed]);
      sentTxs.push({ to: tx.to, value: tx.value ?? "0x0", gas: tx.gas, hash });
      return hash;
    }
    default:
      return rpc(method, params);
  }
}
const sentTxs = [];

const GEN = 10n ** 18n;
const balance = async () => BigInt(await rpc("eth_getBalance", [wallet.address, "latest"]));
if ((await balance()) < 2n * GEN) await rpc("sim_fundAccount", [wallet.address, (5n * GEN).toString()]);
const startBalance = await balance();
console.log(`wallet ${wallet.address} funded: ${Number(startBalance) / 1e18} GEN`);

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(URL_)).ok) break;
  } catch {}
  if (i > 50) throw new Error("preview server did not start");
  await sleep(200);
}

const problems = [];
const rateLimitNoise = []; // public-RPC 429s / CORS-less busy replies: the app retries these, recorded but not fatal
const NOISE = /status of 429|Rate limit exceeded|Server busy|blocked by CORS|ERR_FAILED|Failed to fetch|status of 503/i;
let browser;
let uiResult;
const title = `PolyVerdict frontend e2e trial ${new Date().toISOString().slice(0, 16)}Z`;
const spec = "Resolves YES only if the whitelisted sources definitively report the event. Otherwise AMBIGUOUS_VOID.";
const urls = ["https://apnews.com/hub/federal-reserve", "https://www.federalreserve.gov/newsevents/pressreleases.htm"];
const deadline = new Date(Date.now() + 2 * 86400_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    (NOISE.test(m.text()) ? rateLimitNoise : problems).push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.exposeFunction("__walletRequest", (method, params) => walletRequest(method, params));
  await page.evaluateOnNewDocument(() => {
    window.ethereum = {
      isMetaMask: true,
      request: ({ method, params }) => window.__walletRequest(method, params ?? []),
      on() {},
      removeListener() {},
    };
  });
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  // The docket reads are rate-limited on the public RPC; the wallet flow does not depend on them.
  await page.waitForFunction(() => document.body.innerText.includes("Connect Wallet"), { timeout: 60000 });

  const clickText = (text) =>
    page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t))?.click(), text);

  await clickText("Connect Wallet");
  await page.waitForFunction((a) => document.querySelector("header nav").innerText.includes(a), { timeout: 15000 }, `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`);
  console.log("wallet connected in UI");

  await clickText("Create Prediction Trial");
  await page.waitForSelector('[aria-label="Create Prediction Trial"]', { timeout: 5000 });
  await page.type("#pv-title", title);
  await page.type("#pv-spec", spec);
  await page.type("#pv-urls", urls.join("\n"));
  await page.evaluate((v) => {
    const el = document.querySelector("#pv-deadline");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, deadline);
  mkdirSync("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/e2e-create-form.png" });
  await clickText("Create trial");
  console.log("submitted via UI; waiting for consensus (ACCEPTED/FINALIZED)…");
  await page.waitForFunction(
    () => document.body.innerText.includes("Trial created and read back on-chain") || document.querySelector('[aria-label="Create Prediction Trial"] .text-rose-300'),
    { timeout: 540000, polling: 2000 },
  );
  uiResult = await page.evaluate(() => {
    const dlg = document.querySelector('[aria-label="Create Prediction Trial"]');
    return {
      text: dlg?.innerText ?? "",
      txLink: dlg?.querySelector('a[href*="/transactions/"]')?.href ?? null,
      error: dlg?.querySelector(".text-rose-300")?.textContent ?? null,
    };
  });
  await page.screenshot({ path: "screenshots/e2e-create-result.png" });
  if (uiResult.error) problems.push(`UI error: ${uiResult.error}`);
} catch (e) {
  problems.push(`harness: ${e.message}`);
} finally {
  await browser?.close();
  stop();
}

if (problems.length || !uiResult?.txLink) {
  console.error("FAIL", problems, uiResult);
  process.exit(1);
}

// ---- independent on-chain verification (not through the UI) ----
const hash = sentTxs.at(-1).hash;
const marketId = /created and read back on-chain: (\S+)/.exec(uiResult.text)?.[1];
const reader = createClient({
  chain: { ...studioDevnet, id: CHAIN_ID, rpcUrls: { default: { http: [RPC] } } },
  endpoint: RPC,
  account: { address: "0x0000000000000000000000000000000000000001", type: "json-rpc" },
});
const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 8 || !/rate|busy|429|503|fetch/i.test(String(e.message))) throw e; await sleep(6000 + i * 3000); } } };
const receipt = await retry(() => reader.waitForTransactionReceipt({ hash, waitUntil: "decided", interval: 5000, retries: 100 }));
const trial = await retry(() => reader.readContract({ address: CONTRACT, functionName: "get_market", args: [marketId], jsonSafeReturn: true }));
const count = Number(await retry(() => reader.readContract({ address: CONTRACT, functionName: "get_market_count", args: [], jsonSafeReturn: true })));
const statusName = receipt.status_name ?? receipt.statusName;

const ok =
  ["ACCEPTED", "FINALIZED"].includes(statusName) &&
  receipt.txExecutionResultName === "FINISHED_WITH_RETURN" &&
  trial.market_id === marketId &&
  trial.title === title &&
  trial.creator.toLowerCase() === wallet.address.toLowerCase() &&
  trial.status_name === "OPEN";
const record = {
  verified_at: new Date().toISOString(),
  verified: ok,
  method:
    "Production build served by vite preview, driven by headless Chrome; window.ethereum is an injected EIP-1193 provider that signs eth_sendTransaction with a local wallet key. UI flow: Connect Wallet -> Create Prediction Trial -> Create trial.",
  network: "studio-next",
  chain_id: CHAIN_ID,
  contract_address: CONTRACT,
  wallet_address: wallet.address,
  wallet_funding: "sim_fundAccount (Studio Next faucet RPC) to a freshly generated throwaway key",
  provider_methods_called: [...new Set(walletLog)],
  create_trial: {
    fn: "create_market",
    trial_id: marketId,
    tx_hash: hash,
    tx_url: `${EXPLORER}/transactions/${hash}`,
    // create_market sends no user value, so the signed tx value is exactly the derived consensus feeValue.
    fee_value_wei: BigInt(sentTxs.at(-1).value).toString(),
    signed_tx_gas: BigInt(sentTxs.at(-1).gas).toString(),
    status_name: statusName,
    tx_execution_result_name: receipt.txExecutionResultName,
    result_name: receipt.resultName ?? null,
  },
  ui_result_text: uiResult.text.split("\n").filter((l) => /Trial created|Submitted/.test(l)),
  readback: {
    market_count: count,
    market_id: trial.market_id,
    title: trial.title,
    creator: trial.creator,
    status_name: trial.status_name,
    source_whitelist: trial.source_whitelist,
    source_urls: trial.source_urls,
    end_timestamp: trial.end_timestamp,
    yes_pool: trial.yes_pool,
    no_pool: trial.no_pool,
  },
  unexpected_console_errors: problems,
  rpc_rate_limit_console_noise_count: rateLimitNoise.length,
  rpc_rate_limit_console_noise_note:
    "Studio Next public RPC allows 30 requests/min; background docket reads occasionally got HTTP 429/busy, which the app retries. They are not wallet/transaction errors.",
};
writeFileSync(new URL("../../deployments/verification.json", import.meta.url), JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
if (!ok) {
  console.error("VERIFICATION FAILED");
  process.exit(1);
}
console.log("\nPASS - trial created through the frontend and read back on-chain");
process.exit(0);
