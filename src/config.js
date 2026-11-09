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

// Supported EVM networks
export const evmNetworks = [
  mainnet,
  polygon,
  bsc,
  arbitrum,
  optimism,
  base
];

// Supported Solana network
export const solanaNetworks = [solana];

// Combined network list
export const networks = [
  ...evmNetworks,
  ...solanaNetworks
];

// EVM adapter
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: evmNetworks,
  ssr: false
});

// Solana adapter
export const solanaAdapter = new SolanaAdapter({});

// Initialise AppKit
export const appKit = createAppKit({
  projectId,
  adapters: [
    wagmiAdapter,
    solanaAdapter
  ],
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: "Multichain Wallet",
    description: "Multi-chain crypto wallet dashboard",
    url: window.location.origin,
    icons: []
  }
});