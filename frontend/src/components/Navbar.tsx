import { ExternalLink, Wallet as WalletIcon } from "lucide-react";
import { CHAIN_ID, CONTRACT_URL } from "../chain";
import { shortAddr } from "../lib";
import type { Wallet } from "../wallet";

export function Navbar({ wallet, onProtocol }: { wallet: Wallet; onProtocol: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#08090d]/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl flex-nowrap items-center justify-between gap-3 whitespace-nowrap px-4 sm:px-6">
        <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
          <img src="/seal.svg" alt="PolyVerdict Court Seal" className="h-8 w-8 shrink-0" />
          <span className="serif whitespace-nowrap text-xl font-semibold text-slate-100">
            Poly<span className="text-verdict">Verdict</span>
          </span>
          <span className="live-dot ticker ml-1 hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Studio Next • {CHAIN_ID}
          </span>
        </div>
        <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
          <button
            onClick={onProtocol}
            className="hidden whitespace-nowrap rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white md:inline-block"
          >
            Protocol
          </button>
          <a
            href={CONTRACT_URL}
            target="_blank"
            rel="noreferrer"
            className="ticker hidden items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:border-verdict hover:text-white lg:inline-flex"
          >
            Contract <ExternalLink size={12} aria-hidden />
          </a>
          <button
            onClick={wallet.address ? wallet.disconnect : wallet.connect}
            disabled={wallet.busy}
            className="ticker inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-verdict px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
          >
            <WalletIcon size={14} aria-hidden />
            {wallet.address ? shortAddr(wallet.address) : wallet.busy ? "Connecting…" : "Connect Wallet"}
          </button>
        </div>
      </nav>
    </header>
  );
}
