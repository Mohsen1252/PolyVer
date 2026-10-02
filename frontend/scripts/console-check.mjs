// Verifies the production build loads the LIVE contract with zero console errors.
//   npm run build && npm run console-check
// Serves dist/ with `vite preview`, drives headless Chrome through the main flows
// (docket load -> Evidence Room -> Protocol drawer) and fails on any console error,
// uncaught page error, failed request to the RPC, or an error banner in the UI.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const PORT = 4173;
const URL_ = `http://localhost:${PORT}/`;
const CHROME =
  process.env.CHROME_PATH ||
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!CHROME) {
  console.error("No Chrome found. Set CHROME_PATH.");
  process.exit(2);
}
if (!existsSync("dist/index.html")) {
  console.error("dist/ missing - run `npm run build` first.");
  process.exit(2);
}

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL_)).ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("preview server did not start");
}

const problems = [];
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    const u = req.url();
    // Google Fonts are decorative; a blocked font host must not fail the contract check.
    if (!/fonts\.(googleapis|gstatic)\.com/.test(u)) problems.push(`requestfailed: ${u} ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.url().includes("studio-next.genlayer.com") && res.status() >= 400) problems.push(`rpc http ${res.status()}`);
  });

  await page.goto(URL_, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("article") || document.body.innerText.includes("No cases on the docket yet"),
    { timeout: 60000 },
  );
  const cards = await page.$$eval("article", (a) => a.length);
  console.log(`docket loaded: ${cards} case card(s)`);

  const navHeight = await page.$eval("header nav", (n) => n.getBoundingClientRect().height);
  const wrapped = await page.$eval("header nav", (n) => n.scrollWidth > n.clientWidth);
  console.log(`navbar height ${navHeight}px, overflow=${wrapped}`);
  if (navHeight !== 64) problems.push(`navbar height ${navHeight}px (expected 64px)`);

  mkdirSync("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/docket.png" });

  // Evidence Room
  if (cards > 0) {
    const buttons = await page.$$("article button");
    await buttons[buttons.length - 1].click();
    await page.waitForSelector('[aria-label="Evidence Room"]', { timeout: 10000 });
    await sleep(500);
    await page.screenshot({ path: "screenshots/evidence-room.png" });
    await page.keyboard.press("Escape");
  } else {
    console.log("empty docket (no seeded markets): Evidence Room step skipped");
  }

  // Protocol drawer, all tabs
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Protocol")?.click());
  await page.waitForSelector('[role="tablist"]', { timeout: 5000 });
  for (const tab of await page.$$('[role="tab"]')) await tab.click();
  await page.screenshot({ path: "screenshots/protocol.png" });

  const banner = await page.$('[role="alert"]');
  if (banner) problems.push(`UI error banner: ${await banner.evaluate((e) => e.textContent)}`);
  await sleep(500);
} catch (e) {
  problems.push(`harness: ${e.message}`);
} finally {
  await browser?.close();
  stop();
}

if (problems.length) {
  console.error(`\nFAIL - ${problems.length} problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("PASS - zero console errors on live contract load");
