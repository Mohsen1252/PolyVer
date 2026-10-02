import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { CHAIN_ID } from "../chain";
import type { Wallet } from "../wallet";
import { ActionStatus } from "./ActionPanel";

const inputCls =
  "w-full rounded-md border border-slate-700 bg-[#08090d] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-verdict";

function slug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base || "market"}-${Date.now().toString(36)}`.slice(0, 64);
}

export function CreateMarketModal({ wallet, onClose, onDone }: { wallet: Wallet; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const urls = urlsText.split(/[\s,]+/).filter(Boolean);
  const hosts = [...new Set(urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }))];
  const endTs = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;

  function validate(): string | null {
    if (!title.trim()) return "Enter the market question.";
    if (!spec.trim()) return "Enter a strict resolution clause.";
    if (urls.length === 0 || urls.length > 6) return "Provide 1–6 source URLs.";
    if (urls.some((u) => !u.startsWith("https://")) || hosts.includes("")) return "Every source must be a valid https:// URL.";
    if (hosts.length > 6) return "At most 6 distinct domains.";
    if (!endTs || endTs <= Math.floor(Date.now() / 1000) + 60) return "Pick a resolution deadline in the future.";
    return null;
  }

  async function submit() {
    setErr(null);
    const v = validate();
    if (v) return setErr(v);
    if (!wallet.address) return setErr(`Connect MetaMask on Studio Next (chain ${CHAIN_ID}) first.`);
    try {
      setBusy(true);
      const h = await wallet.send("create_market", [slug(title), title.trim(), spec.trim(), hosts, urls, endTs]);
      setHash(h);
      setTimeout(onDone, 5000);
    } catch (e) {
      setErr((e as Error).message?.split("\n")[0] ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create Prediction Trial">
      <div className="fade-in absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="slide-in relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-800 bg-[#0a0b11] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="serif text-2xl text-slate-100">Create Prediction Trial</h2>
            <p className="mt-1 text-sm text-slate-400">
              Sources are frozen after the first stake. Validators will read only the URLs you list here.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md border border-slate-800 p-2 text-slate-400 hover:text-white">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="pv-title" className="ticker text-[10px] uppercase tracking-widest text-slate-500">Market question</label>
            <input id="pv-title" className={`${inputCls} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Will the ECB cut rates at its next meeting?" />
          </div>
          <div>
            <label htmlFor="pv-spec" className="ticker text-[10px] uppercase tracking-widest text-slate-500">Resolution clause</label>
            <textarea id="pv-spec" className={`${inputCls} mt-1 min-h-24`} value={spec} onChange={(e) => setSpec(e.target.value)} maxLength={1500} placeholder="Resolves YES only if the sources definitively show… Otherwise AMBIGUOUS_VOID." />
          </div>
          <div>
            <label htmlFor="pv-urls" className="ticker text-[10px] uppercase tracking-widest text-slate-500">Source whitelist URLs (https, one per line)</label>
            <textarea id="pv-urls" className={`${inputCls} ticker mt-1 min-h-20`} value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder={"https://www.reuters.com/world/…\nhttps://apnews.com/…"} />
            {hosts.filter(Boolean).length > 0 && (
              <p className="ticker mt-1 text-[10px] text-slate-500">Whitelisted domain roots: {hosts.filter(Boolean).join(", ")}</p>
            )}
          </div>
          <div>
            <label htmlFor="pv-deadline" className="ticker text-[10px] uppercase tracking-widest text-slate-500">Resolution deadline (betting closes)</label>
            <input id="pv-deadline" type="datetime-local" className={`${inputCls} ticker mt-1`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={busy || !wallet.address}
          title={wallet.address ? undefined : `Connect MetaMask on Studio Next (chain ${CHAIN_ID}) to create a trial`}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-verdict px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />} Create trial
        </button>
        {!wallet.address && (
          <p className="ticker mt-2 text-[11px] text-slate-500">Wallet not connected — connect MetaMask on Studio Next (chain {CHAIN_ID}) to submit.</p>
        )}
        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
        <ActionStatus run={{ busy, hash, err: null, go: async () => {} }} />
      </div>
    </div>
  );
}
