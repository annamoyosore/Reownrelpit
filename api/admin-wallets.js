const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const TABLE_ID = process.env.APPWRITE_TABLE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const jwt = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";

    if (!jwt) {
      return res.status(401).json({
        success: false,
        error: "Admin authentication required"
      });
    }

    // Verify the Appwrite user session.
    const accountResponse = await fetch(
      `${ENDPOINT}/account`,
      {
        headers: {
          "X-Appwrite-Project": PROJECT_ID,
          "X-Appwrite-JWT": jwt
        }
      }
    );

    if (!accountResponse.ok) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired admin session"
      });
    }

    const account = await accountResponse.json();

    // Only your configured email is authorised.
    if (
      !ADMIN_EMAIL ||
      account.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    const url =
      `${ENDPOINT}/tablesdb/databases/${DATABASE_ID}` +
      `/tables/${TABLE_ID}/rows`;

    const searchUrl = new URL(url);

    searchUrl.searchParams.append(
      "queries[]",
      JSON.stringify({
        method: "orderDesc",
        attribute: "lastSeenAt"
      })
    );

    searchUrl.searchParams.append(
      "queries[]",
      JSON.stringify({
        method: "limit",
        values: [100]
      })
    );

    const response = await fetch(searchUrl, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-Key": API_KEY
      }
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Appwrite admin error:", result);

      return res.status(502).json({
        success: false,
        error: "Unable to retrieve wallet records"
      });
    }

    const wallets = result.rows || [];

    return res.status(200).json({
      success: true,
      total: wallets.length,
      wallets
    });

  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
}