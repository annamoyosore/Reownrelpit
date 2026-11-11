import crypto from "node:crypto";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

const TRANSFER_TABLE_ID =
  process.env.APPWRITE_TRANSFER_TABLE_ID ||
  "6af439940013c6ca7410";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function adminAuthorized(req) {
  const supplied = String(
    req.headers["x-admin-password"] || ""
  );

  if (!ADMIN_PASSWORD || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_PASSWORD);

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(
    String(value || "")
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  if (!adminAuthorized(req)) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication failed"
    });
  }

  if (
    !ENDPOINT ||
    !PROJECT_ID ||
    !DATABASE_ID ||
    !API_KEY
  ) {
    return res.status(500).json({
      success: false,
      message: "Missing Appwrite environment variables"
    });
  }

  const {
    walletAddress,
    network,
    chainId,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    amount,
    recipientAddress
  } = req.body || {};

  const decimals = Number(tokenDecimals);
  const chain = Number(chainId);
  const amountText = String(amount ?? "").trim();

  if (
    !validAddress(walletAddress) ||
    !validAddress(recipientAddress) ||
    !validAddress(tokenAddress)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter valid EVM wallet, token contract and recipient addresses."
    });
  }

  if (!Number.isInteger(chain) || chain <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid EVM chain ID."
    });
  }

  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  ) {
    return res.status(400).json({
      success: false,
      message: "Token decimals must be between 0 and 36."
    });
  }

  if (
    !/^(?:\d+)(?:\.\d+)?$/.test(amountText) ||
    !Number.isFinite(Number(amountText)) ||
    Number(amountText) <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid amount greater than zero."
    });
  }

  if (
    (amountText.split(".")[1] || "").length > decimals
  ) {
    return res.status(400).json({
      success: false,
      message: `This token supports at most ${decimals} decimal places.`
    });
  }

  try {
    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();

    const rowData = {
      walletAddress: walletAddress.toLowerCase(),
      requestId,
      network: String(network || `Chain ${chain}`).slice(0, 80),
      chainId: chain,
      tokenAddress: tokenAddress.toLowerCase(),
      tokenSymbol: String(tokenSymbol || "TOKEN").slice(0, 24),
      tokenDecimals: decimals,
      amount: amountText,
      recipientAddress: recipientAddress.toLowerCase(),
      status: "pending",
      transactionHash: "",
      requestedAt: now,
      completedAt: ""
    };

    const url =
      `${ENDPOINT.replace(/\/$/, "")}/tablesdb/${DATABASE_ID}` +
      `/tables/${TRANSFER_TABLE_ID}/rows`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      },
      body: JSON.stringify({
        rowId: requestId,
        data: rowData
      })
    });

    const raw = await response.text();

    let result;

    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw };
    }

    if (!response.ok) {
      console.error(
        "Create transfer request Appwrite error:",
        result
      );

      return res.status(response.status).json({
        success: false,
        message: result.message || "Could not create transfer request",
        details: result
      });
    }

    return res.status(201).json({
      success: true,
      request: rowData
    });

  } catch (error) {
    console.error("Create transfer request error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error"
    });
  }
}