import { useCallback, useEffect, useState } from "react";
import { createClient } from "genlayer-js";
import { CHAIN_ID_HEX, CONTRACT_ADDRESS, EXPLORER_URL, RPC_URL, chain } from "./chain";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
};

const eth = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum;

export type Wallet = {
  address: `0x${string}` | null;
  available: boolean;
  busy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (fn: string, args: (string | number)[], value?: bigint) => Promise<string>;
};

async function ensureChain(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e) {
    if ((e as { code?: number }).code === 4902 || /Unrecognized chain/i.test(String(e))) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: "GenLayer Studio Next",
            nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      });
    } else {
      throw e;
    }
  }
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = eth();
    if (!p?.on) return;
    const onAccounts = (accs: unknown) => {
      const a = (accs as string[])[0];
      setAddress(a ? (a as `0x${string}`) : null);
    };
    p.on("accountsChanged", onAccounts);
    return () => p.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const connect = useCallback(async () => {
    const p = eth();
    setError(null);
    if (!p) {
      setError("No injected wallet found. Install MetaMask or another EIP-1193 wallet.");
      return;
    }
    try {
      setBusy(true);
      const accs = (await p.request({ method: "eth_requestAccounts" })) as string[];
      await ensureChain(p);
      setAddress((accs[0] as `0x${string}`) ?? null);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const send = useCallback(
    async (fn: string, args: (string | number)[], value = 0n) => {
      const p = eth();
      if (!p || !address) throw new Error("Connect a wallet first");
      await ensureChain(p);
      const client = createClient({ chain, endpoint: RPC_URL, account: address, provider: p as never });
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: fn,
        args: args as never,
        value,
      } as never);
      return String(hash);
    },
    [address],
  );

  return {
    address,
    available: !!eth(),
    busy,
    error,
    connect,
    disconnect: () => setAddress(null),
    send,
  };
}
