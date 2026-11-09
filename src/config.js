import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";

import {
  mainnet,
  polygon,
  bsc,
  arbitrum,
  optimism,
  base,
  solana
} from "@reown/appkit/networks";

export const projectId =
  import.meta.env.VITE_APPKIT_PROJECT_ID ||
  import.meta.env.VITE_PROJECT_ID;

if (!projectId) {
  throw new Error("Reown Project ID is missing");
}

// Six EVM mainnets
export const evmNetworks = [
  mainnet,
  polygon,
  bsc,
  arbitrum,
  optimism,
  base
];

// Solana mainnet
export const solanaNetworks = [solana];

// All supported networks
export const networks = [
  ...evmNetworks,
  ...solanaNetworks
];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: evmNetworks,
  ssr: false
});

export const solanaAdapter = new SolanaAdapter({
  networks: solanaNetworks
});

export const appKit = createAppKit({
  projectId,
  adapters: [
    wagmiAdapter,
    solanaAdapter
  ],
  networks,
  metadata: {
    name: "Multichain Wallet",
    description: "Multi-chain crypto wallet dashboard",
    url: window.location.origin,
    icons: []
  }
});