const NETWORKS = [
  {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    slug: "eth-mainnet"
  },
  {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    symbol: "POL",
    slug: "polygon-mainnet"
  },
  {
    id: "bnb",
    name: "BNB Smart Chain",
    chainId: 56,
    symbol: "BNB",
    slug: "bnb-mainnet"
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    symbol: "ETH",
    slug: "arb-mainnet"
  },
  {
    id: "optimism",
    name: "Optimism",
    chainId: 10,
    symbol: "ETH",
    slug: "opt-mainnet"
  },
  {
    id: "base",
    name: "Base",
    chainId: 8453,
    symbol: "ETH",
    slug: "base-mainnet"
  }
];

const API_KEY = process.env.ALCHEMY_API_KEY;

function formatUnits(value, decimals) {
  const amount = BigInt(value);
  const divisor = 10n ** BigInt(decimals);

  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const decimalPart = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${whole}.${decimalPart}`;
}

async function rpcCall(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error("Blockchain provider request failed");
  }

  const result = await response.json();

  if (result.error) {
    throw new Error("Blockchain provider returned an error");
  }

  return result.result;
}

async function scanNetwork(network, address) {
  const url =
    `https://${network.slug}.g.alchemy.com/v2/${API_KEY}`;

  // Get native coin balance
  const nativeRaw = await rpcCall(
    url,
    "eth_getBalance",
    [address, "latest"]
  );

  const nativeBalance = formatUnits(
    BigInt(nativeRaw),
    18
  );

  const assets = [];

  if (BigInt(nativeRaw) > 0n) {
    assets.push({
      type: "native",
      name: network.name,
      symbol: network.symbol,
      balance: nativeBalance,
      contractAddress: null,
      chainId: network.chainId
    });
  }

  // Discover ERC20 tokens
  let pageKey = undefined;
  let pages = 0;

  do {
    const options = { maxCount: 100 };

    if (pageKey) {
      options.pageKey = pageKey;
    }

    const params = [
      address,
      "erc20",
      options
    ];

    const tokenResult = await rpcCall(
      url,
      "alchemy_getTokenBalances",
      params
    );

    const tokens = tokenResult.tokenBalances || [];

    // Ignore zero balances
    const activeTokens = tokens.filter(token => {
      try {
        return BigInt(token.tokenBalance || "0x0") > 0n;
      } catch {
        return false;
      }
    });

    // Retrieve token information
    const tokenDetails = await Promise.all(
      activeTokens.map(async token => {
        try {
          const metadata = await rpcCall(
            url,
            "alchemy_getTokenMetadata",
            [token.contractAddress]
          );

          const decimals = Number(metadata.decimals);

          if (
            !Number.isInteger(decimals) ||
            decimals < 0 ||
            decimals > 255
          ) {
            return null;
          }

          return {
            type: "token",
            name: metadata.name || "Unknown Token",
            symbol: metadata.symbol || "UNKNOWN",
            balance: formatUnits(
              BigInt(token.tokenBalance),
              decimals
            ),
            decimals,
            contractAddress: token.contractAddress,
            logo: metadata.logo || null,
            chainId: network.chainId
          };

        } catch {
          return null;
        }
      })
    );

    assets.push(
      ...tokenDetails.filter(Boolean)
    );

    pageKey = tokenResult.pageKey;
    pages++;

  } while (pageKey && pages < 5);

  return {
    network: network.name,
    chainId: network.chainId,
    assets
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!API_KEY) {
    return res.status(500).json({
      error: "Blockchain provider is not configured"
    });
  }

  const address = req.body?.address;

  if (
    typeof address !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(address)
  ) {
    return res.status(400).json({
      error: "Invalid EVM wallet address"
    });
  }

  const results = await Promise.allSettled(
    NETWORKS.map(network =>
      scanNetwork(network, address)
    )
  );

  const networks = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return {
        success: true,
        ...result.value
      };
    }

    return {
      success: false,
      network: NETWORKS[index].name,
      chainId: NETWORKS[index].chainId,
      assets: []
    };
  });

  const assets = networks.flatMap(
    network => network.assets
  );

  return res.status(200).json({
    address,
    networks,
    assets,
    updatedAt: new Date().toISOString()
  });
};