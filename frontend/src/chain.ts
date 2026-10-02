import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import deployment from "../../deployments/studio-next.json";

export const RPC_URL = "https://studio-next.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio-next.genlayer.com";
export const CHAIN_ID = 61997;
export const CHAIN_ID_HEX = "0xF22D";

/** Studio Next shares the Studio chain id (61997) and consensus contracts with studioDevnet. */
export const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Studio Next Explorer", url: EXPLORER_URL } },
} as typeof studioDevnet;

export const CONTRACT_ADDRESS = deployment.contract_address as `0x${string}`;
export const CONTRACT_URL = `${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`;
export const txUrl = (hash: string) => `${EXPLORER_URL}/transactions/${hash}`;

/** Reads are free: any address works as `from`. */
const READER = { address: "0x0000000000000000000000000000000000000001", type: "json-rpc" } as const;

export const reader = createClient({ chain, endpoint: RPC_URL, account: READER as never });

export const BOND_RESOLVE = 100000000000000000n; // 0.1 GEN
export const BOND_CHALLENGE = 200000000000000000n; // 0.2 GEN
