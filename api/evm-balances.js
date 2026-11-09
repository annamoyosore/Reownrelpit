const NETWORKS = [
  {
    name: "Ethereum",
    slug: "eth-mainnet",
    chainId: 1
  },
  {
    name: "Polygon",
    slug: "polygon-mainnet",
    chainId: 137
  },
  {
    name: "BNB Smart Chain",
    slug: "bnb-mainnet",
    chainId: 56
  },
  {
    name: "Arbitrum",
    slug: "arb-mainnet",
    chainId: 42161
  },
  {
    name: "Optimism",
    slug: "opt-mainnet",
    chainId: 10
  },
  {
    name: "Base",
    slug: "base-mainnet",
    chainId: 8453
  }
];

function formatTokenBalance(hexBalance, decimals) {
  if (!hexBalance || !Number.isInteger(decimals)) {
    return "0";
  }

  const raw = BigInt(hexBalance);
  const divisor = 10n ** BigInt(decimals);

  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${whole}.${fractionText}`;
}

async function fetchNetworkBatch(apiKey, address, networks) {
  const url =
    `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      addresses: [
        {
          address,
          networks: networks.map(network => network.slug)
        }
      ],
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Alchemy API request failed"
    );
  }

  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.ALCHEMY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Alchemy API key is not configured"
    });
  }

  const address = req.body?.address;

  if (
    typeof address !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(address)
  ) {
    return res.status(400).json({
      error: "A valid EVM wallet address is required"
    });
  }

  const assets = [];
  const networkResults = [];
  const failedNetworks = [];

  // The API supports up to five networks per address.
  const batches = [
    NETWORKS.slice(0, 5),
    NETWORKS.slice(5)
  ];

  for (const batch of batches) {
    if (batch.length === 0) continue;

    try {
      const result = await fetchNetworkBatch(
        apiKey,
        address,
        batch
      );

      const tokens = result.data?.tokens || [];

      for (const token of tokens) {
        const network = NETWORKS.find(
          item => item.slug === token.network
        );

        if (!network) continue;

        const metadata = token.tokenMetadata || {};
        const decimals = Number(metadata.decimals);

        if (!Number.isInteger(decimals) || decimals < 0) {
          continue;
        }

        const balance = formatTokenBalance(
          token.tokenBalance,
          decimals
        );

        const price = token.tokenPrices?.find(
          item => item.currency === "usd"
        );

        assets.push({
          name: metadata.name || "Unknown Token",
          symbol: metadata.symbol || "UNKNOWN",
          address: token.tokenAddress || null,
          contractAddress: token.tokenAddress || null,
          network: network.name,
          networkSlug: network.slug,
          chainId: network.chainId,
          decimals,
          balance,
          rawBalance: token.tokenBalance,
          logo: metadata.logo || null,
          priceUsd: price ? price.value : null
        });
      }

      const partialErrors =
        result.error?.partialErrors || [];

      for (const network of batch) {
        const failed = partialErrors.some(
          item => item.network === network.slug
        );

        if (failed) {
          failedNetworks.push(network.name);

          networkResults.push({
            name: network.name,
            slug: network.slug,
            chainId: network.chainId,
            success: false
          });
        } else {
          networkResults.push({
            name: network.name,
            slug: network.slug,
            chainId: network.chainId,
            success: true
          });
        }
      }

    } catch (error) {
      for (const network of batch) {
        failedNetworks.push(network.name);

        networkResults.push({
          name: network.name,
          slug: network.slug,
          chainId: network.chainId,
          success: false,
          error: error.message
        });
      }
    }
  }

  return res.status(200).json({
    address,
    assets,
    networks: networkResults,
    failedNetworks,
    updatedAt: new Date().toISOString()
  });
};