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

  const headers = {
    "Content-Type": "application/json",
    "X-Appwrite-Project": PROJECT_ID,
    "X-Appwrite-Key": API_KEY
  };

  try {
    const {
      walletAddress,
      network,
      chainId,
      connectionStatus
    } = req.body || {};

    if (
      typeof walletAddress !== "string" ||
      !walletAddress.trim() ||
      walletAddress.length > 100
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address"
      });
    }

    if (
      typeof network !== "string" ||
      !network.trim() ||
      network.length > 50
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid network"
      });
    }

    const now = new Date().toISOString();

    const base =
      `${ENDPOINT.replace(/\/$/, "")}/tablesdb/databases/${DATABASE_ID}` +
      `/tables/${TABLE_ID}/rows`;

    const wallet = walletAddress.trim();

    // Search for an existing wallet
    const searchUrl = new URL(base);

    const queries = [
      {
        method: "equal",
        attribute: "walletAddress",
        values: [wallet]
      },
      {
        method: "limit",
        values: [1]
      }
    ];

    queries.forEach(query => {
      searchUrl.searchParams.append(
        "queries[]",
        JSON.stringify(query)
      );
    });

    const searchResponse = await fetch(searchUrl, {
      method: "GET",
      headers
    });

    const searchText = await searchResponse.text();

    let searchData;

    try {
      searchData = JSON.parse(searchText);
    } catch {
      searchData = { message: searchText };
    }

    if (!searchResponse.ok) {
      console.error("Appwrite search error:", searchData);

      return res.status(502).json({
        success: false,
        stage: "search",
        error: searchData.message || "Wallet search failed",
        details: searchData
      });
    }

    const existing = searchData.rows?.[0];

    const data = {
      walletAddress: wallet,
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

    let saveResponse;

    if (existing) {
      // Update existing wallet
      saveResponse = await fetch(
        `${base}/${encodeURIComponent(existing.$id)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ data })
        }
      );
    } else {
      // Create new wallet
      data.connectedAt = now;

      saveResponse = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rowId: crypto.randomUUID(),
          data
        })
      });
    }

    const saveText = await saveResponse.text();

    let saveData;

    try {
      saveData = JSON.parse(saveText);
    } catch {
      saveData = { message: saveText };
    }

    if (!saveResponse.ok) {
      console.error("Appwrite save error:", saveData);

      return res.status(502).json({
        success: false,
        stage: existing ? "update" : "create",
        error: saveData.message || "Unable to save wallet",
        details: saveData
      });
    }

    return res.status(200).json({
      success: true,
      message: existing
        ? "Wallet record updated successfully"
        : "Wallet connected and recorded successfully",
      wallet: saveData
    });

  } catch (error) {
    console.error("Wallet API error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Server error"
    });
  }
}