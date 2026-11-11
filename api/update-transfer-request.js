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

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
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
    requestId,
    status,
    transactionHash
  } = req.body || {};

  const wallet = String(
    walletAddress || ""
  ).toLowerCase();

  const id = String(requestId || "");

  if (!validAddress(wallet) || !id) {
    return res.status(400).json({
      success: false,
      message: "Invalid wallet address or request ID."
    });
  }

  if (!["rejected", "submitted"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Unsupported status."
    });
  }

  if (
    status === "submitted" &&
    !/^0x[a-fA-F0-9]{64}$/.test(
      String(transactionHash || "")
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid transaction hash is required."
    });
  }

  try {
    const base =
      `${ENDPOINT.replace(/\/$/, "")}/tablesdb/${DATABASE_ID}` +
      `/tables/${TRANSFER_TABLE_ID}/rows`;

    const searchUrl = new URL(base);

    searchUrl.searchParams.set("limit", "100");

    searchUrl.searchParams.append(
      "queries[]",
      JSON.stringify({
        method: "equal",
        attribute: "requestId",
        values: [id]
      })
    );

    searchUrl.searchParams.append(
      "queries[]",
      JSON.stringify({
        method: "equal",
        attribute: "walletAddress",
        values: [wallet]
      })
    );

    const searchResponse = await fetch(searchUrl, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      }
    });

    const searchRaw = await searchResponse.text();

    let searchData;

    try {
      searchData = JSON.parse(searchRaw);
    } catch {
      searchData = { message: searchRaw };
    }

    if (!searchResponse.ok) {
      return res.status(searchResponse.status).json({
        success: false,
        message: searchData.message || "Request lookup failed",
        details: searchData
      });
    }

    const row = (searchData.rows || []).find(item => {
      const data = item.data || item;

      return (
        String(data.requestId) === id &&
        String(data.walletAddress || "").toLowerCase() === wallet
      );
    });

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Transfer request not found for this wallet."
      });
    }

    const current = row.data || row;

    if (current.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "This request is no longer pending."
      });
    }

    const rowId = row.$id || row.rowId;

    if (!rowId) {
      return res.status(500).json({
        success: false,
        message: "Appwrite row ID was not returned."
      });
    }

    const patch = status === "submitted"
      ? {
          status: "submitted",
          transactionHash: String(transactionHash).toLowerCase()
        }
      : {
          status: "rejected"
        };

    const updateResponse = await fetch(
      `${base}/${encodeURIComponent(rowId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": PROJECT_ID,
          "X-Appwrite-Key": API_KEY
        },
        body: JSON.stringify({
          data: patch
        })
      }
    );

    const updateRaw = await updateResponse.text();

    let updateData;

    try {
      updateData = JSON.parse(updateRaw);
    } catch {
      updateData = { message: updateRaw };
    }

    if (!updateResponse.ok) {
      return res.status(updateResponse.status).json({
        success: false,
        message: updateData.message || "Could not update request",
        details: updateData
      });
    }

    return res.status(200).json({
      success: true,
      status,
      transactionHash: patch.transactionHash || null
    });

  } catch (error) {
    console.error("Update transfer request error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error"
    });
  }
}