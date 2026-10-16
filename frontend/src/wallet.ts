import { useCallback, useEffect, useState } from "react";
import { ensureChain, sendWrite, type Eip1193 } from "./txPath";

const eth = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum;

export type Wallet = {
  address: `0x${string}` | null;
  available: boolean;
  busy: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (fn: string, args: unknown[], value?: bigint) => Promise<string>;
};

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
    async (fn: string, args: unknown[], value = 0n) => {
      const p = eth();
      if (!p || !address) throw new Error("Connect a wallet first");
      return sendWrite(p, address, fn, args, value);
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
