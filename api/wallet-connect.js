import crypto from "crypto";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const TABLE_ID = process.env.APPWRITE_TABLE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  if (!ENDPOINT || !PROJECT_ID || !DATABASE_ID ||
      !TABLE_ID || !API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Appwrite configuration missing"
    });
  }

  try {
    const {
      walletAddress,
      network,
      chainId,
      connectionStatus
    } = req.body || {};

    if (
      typeof walletAddress !== "string" ||
      walletAddress.length > 100 ||
      !walletAddress.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address"
      });
    }

    if (
      typeof network !== "string" ||
      network.length > 50
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid network"
      });
    }

    const now = new Date().toISOString();

    const headers = {
      "Content-Type": "application/json",
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY
    };

    const base =
      `${ENDPOINT}/tablesdb/databases/${DATABASE_ID}` +
      `/tables/${TABLE_ID}/rows`;

    // Find an existing record for this wallet.
    const queries = [
      JSON.stringify({
        method: "equal",
        attribute: "walletAddress",
        values: [walletAddress.trim()]
      }),
      JSON.stringify({
        method: "limit",
        values: [1]
      })
    ];

    const searchUrl = new URL(base);

    queries.forEach(q =>
      searchUrl.searchParams.append("queries[]", q)
    );

    const searchResponse = await fetch(searchUrl, {
      method: "GET",
      headers
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error("Appwrite search error:", searchData);

      return res.status(502).json({
        success: false,
        error: "Unable to check wallet records"
      });
    }

    const existing = searchData.rows?.[0];

    const data = {
      walletAddress: walletAddress.trim(),
      network: network.trim(),
      chainId: Number.isInteger(Number(chainId))
        ? Number(chainId)
        : 0,
      connectionStatus:
        connectionStatus === "disconnected"
          ? "disconnected"
          : "connected",
      lastSeenAt: now
    };

    let response;

    if (existing) {
      response = await fetch(
        `${base}/${encodeURIComponent(existing.$id)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ data })
        }
      );
    } else {
      data.connectedAt = now;

      response = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rowId: crypto.randomUUID(),
          data
        })
      });
    }

    const result = await response.json();

    if (!response.ok) {
      console.error("Appwrite save error:", result);

      return res.status(502).json({
        success: false,
        error: "Unable to save wallet connection"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Wallet connection recorded"
    });

  } catch (error) {
    console.error("Wallet connection error:", error);

    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
}