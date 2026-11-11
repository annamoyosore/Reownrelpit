const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
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

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message || "Solana RPC request failed"
    );
  }

  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { address } = req.body || {};

    if (
      !address ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid Solana wallet address"
      });
    }

    // Get native SOL balance
    const solResult = await rpc("getBalance", [
      address,
      { commitment: "confirmed" }
    ]);

    const solBalance = solResult.value / 1e9;

    const assets = [
      {
        name: "Solana",
        symbol: "SOL",
        balance: solBalance.toString(),
        decimals: 9,
        network: "Solana",
        chainId: "solana:mainnet",
        type: "native",
        contractAddress: null
      }
    ];

    // Get SPL token accounts
    const tokenResult = await rpc(
      "getTokenAccountsByOwner",
      [
        address,
        {
          programId:
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          encoding: "jsonParsed",
          commitment: "confirmed"
        }
      ]
    );

    // Also scan Token-2022 accounts
    const token2022Result = await rpc(
      "getTokenAccountsByOwner",
      [
        address,
        {
          programId:
            "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          encoding: "jsonParsed",
          commitment: "confirmed"
        }
      ]
    );

    const tokenAccounts = [
      ...(tokenResult.value || []),
      ...(token2022Result.value || [])
    ];

    // Group accounts by mint
    const groupedTokens = {};

    for (const account of tokenAccounts) {
      const info =
        account.account.data.parsed.info;

      const mint = info.mint;
      const amount = info.tokenAmount;

      if (!mint || !amount) continue;

      if (!groupedTokens[mint]) {
        groupedTokens[mint] = {
          mint,
          rawBalance: 0n,
          decimals: amount.decimals
        };
      }

      groupedTokens[mint].rawBalance +=
        BigInt(amount.amount || "0");
    }

    // Convert SPL balances
    for (const token of Object.values(groupedTokens)) {
      const balance =
        Number(token.rawBalance) /
        Math.pow(10, token.decimals);

      if (balance <= 0) continue;

      assets.push({
        name: "SPL Token",
        symbol:
          token.mint.slice(0, 4) +
          "..." +
          token.mint.slice(-4),
        balance: balance.toString(),
        decimals: token.decimals,
        network: "Solana",
        chainId: "solana:mainnet",
        type: "token",
        contractAddress: token.mint
      });
    }

    return res.status(200).json({
      success: true,
      address,
      assets,
      networks: [
        {
          name: "Solana",
          network: "Solana",
          success: true
        }
      ],
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Solana balance error:", error);

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Unable to retrieve Solana balances"
    });
  }
}