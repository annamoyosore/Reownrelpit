const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

const TRANSFER_TABLE_ID =
  process.env.APPWRITE_TRANSFER_TABLE_ID ||
  "6af439940013c6ca7410";

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(
    String(value || "")
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const walletAddress = String(
    req.query.walletAddress || ""
  ).toLowerCase();

  if (!validAddress(walletAddress)) {
    return res.status(400).json({
      success: false,
      message: "A valid EVM walletAddress is required."
    });
  }

  if (
    !ENDPOINT ||
    !PROJECT_ID ||
    !DATABASE_ID ||
    !API_KEY ||
    !TRANSFER_TABLE_ID
  ) {
    return res.status(500).json({
      success: false,
      message: "Missing Appwrite environment variables"
    });
  }

  try {
    const url = new URL(
      `${ENDPOINT.replace(/\/$/, "")}/tablesdb/${DATABASE_ID}` +
      `/tables/${TRANSFER_TABLE_ID}/rows`
    );

    url.searchParams.set("limit", "100");

    url.searchParams.append(
      "queries[]",
      JSON.stringify({
        method: "equal",
        attribute: "walletAddress",
        values: [walletAddress]
      })
    );

    const response = await fetch(url, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      }
    });

    const raw = await response.text();

    let result;

    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: result.message || "Could not check transfer requests",
        details: result
      });
    }

    const requests = (result.rows || [])
      .map(row => ({
        ...(row.data || row),
        rowId: row.$id || row.rowId
      }))
      .filter(row =>
        String(row.walletAddress || "").toLowerCase() === walletAddress
      )
      .filter(row => row.status === "pending")
      .sort((a, b) =>
        String(b.requestedAt || "").localeCompare(
          String(a.requestedAt || "")
        )
      );

    return res.status(200).json({
      success: true,
      requests
    });

  } catch (error) {
    console.error("Check transfer requests error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error"
    });
  }
}