import crypto from "node:crypto";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

const TABLE_ID =
  process.env.APPWRITE_TRANSFER_TABLE_ID ||
  "6af439940013c6ca7410";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function authorized(req) {
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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  if (!authorized(req)) {
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

  try {
    const url =
      `${ENDPOINT.replace(/\/$/, "")}/tablesdb/${DATABASE_ID}` +
      `/tables/${TABLE_ID}/rows?limit=100`;

    const response = await fetch(url, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      }
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data.message || "Unable to retrieve requests",
        details: data
      });
    }

    const requests = (data.rows || [])
      .map(row => ({
        ...(row.data || row),
        rowId: row.$id || row.rowId
      }))
      .sort((a, b) =>
        String(b.requestedAt || "").localeCompare(
          String(a.requestedAt || "")
        )
      );

    return res.status(200).json({
      success: true,
      total: data.total || requests.length,
      requests
    });

  } catch (error) {
    console.error("Admin transfer requests error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error"
    });
  }
}