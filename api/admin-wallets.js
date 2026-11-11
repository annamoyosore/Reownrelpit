const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const TABLE_ID = process.env.APPWRITE_TABLE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    if (
      !ENDPOINT ||
      !PROJECT_ID ||
      !DATABASE_ID ||
      !TABLE_ID ||
      !API_KEY
    ) {
      return res.status(500).json({
        success: false,
        message: "Missing Appwrite environment variables"
      });
    }

    const url =
      `${ENDPOINT}/tablesdb/databases/${DATABASE_ID}` +
      `/tables/${TABLE_ID}/rows?limit=100`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data.message || "Unable to retrieve wallets",
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      total: data.total || 0,
      wallets: data.rows || []
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}