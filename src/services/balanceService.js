import { discoverEvmAssets } from "./tokenDiscovery.js";
import { discoverSolanaAssets } from "./solanaDiscovery.js";

export async function getWalletPortfolio(address) {
  if (!address) {
    throw new Error("Wallet address is required");
  }

  const result = await discoverEvmAssets(address);

  const networks = result.networks || [];
  const assets = result.assets || [];

  const successfulNetworks = networks.filter(
    network => network.success
  );

  const failedNetworks = networks.filter(
    network => !network.success
  );

  return {
    address: result.address,

    assets: assets.filter(
      asset => Number(asset.balance) > 0
    ),

    networks: successfulNetworks,

    failedNetworks,

    totalAssets: assets.length,

    successfulNetworkCount:
      successfulNetworks.length,

    failedNetworkCount:
      failedNetworks.length,

    updatedAt: result.updatedAt
  };
}

// Solana portfolio
export async function getSolanaWalletPortfolio(address) {
  const result = await discoverSolanaAssets(address);

  const networks = result.networks || [];

  const successfulNetworks = networks.filter(
    network => network.success
  );

  const failedNetworks = networks.filter(
    network => !network.success
  );

  const assets = result.assets || [];

  return {
    address: result.address,

    assets: assets.filter(
      asset => Number(asset.balance) > 0
    ),

    networks: successfulNetworks,

    failedNetworks,

    totalAssets: assets.length,

    successfulNetworkCount:
      successfulNetworks.length,

    failedNetworkCount:
      failedNetworks.length,

    updatedAt: result.updatedAt
  };
}

export async function refreshWalletPortfolio(address) {
  return await getWalletPortfolio(address);
}