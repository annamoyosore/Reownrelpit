import { discoverEvmAssets } from "./tokenDiscovery.js";

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

    assets: assets.filter(asset => {
      try {
        return Number(asset.balance) > 0;
      } catch {
        return false;
      }
    }),

    networks: successfulNetworks,

    failedNetworks,

    totalAssets: assets.length,

    successfulNetworkCount: successfulNetworks.length,

    failedNetworkCount: failedNetworks.length,

    updatedAt: result.updatedAt
  };
}

export async function refreshWalletPortfolio(address) {
  return await getWalletPortfolio(address);
}