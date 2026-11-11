import { isAdminAuthorized } from "./_admin-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  if (!isAdminAuthorized(req)) {
    return res.status(401).json({
      success: false,
      message: "Admin access required"
    });
  }

  try {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const tableId =
      process.env.APPWRITE_TRANSFER_TABLE_ID ||
      "6af439940013c6ca7410";
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !databaseId || !apiKey) {
      throw new Error("Appwrite environment variables are incomplete");
    }

    const base = endpoint.replace(/\/+$/, "");

    const response = await fetch(
      `${base}/tablesdb/${databaseId}/tables/${tableId}/rows?limit=100`,
      {
        method: "GET",
        headers: {
          "X-Appwrite-Project": projectId,
          "X-Appwrite-Key": apiKey
        }
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Appwrite transfer request error:", result);

      return res.status(response.status).json({
        success: false,
        message: result.message || "Unable to retrieve transfer requests"
      });
    }

    const requests = (result.rows || []).sort((a, b) => {
      return new Date(b.requestedAt || b.$createdAt) -
             new Date(a.requestedAt || a.$createdAt);
    });

    return res.status(200).json({
      success: true,
      requests
    });

  } catch (error) {
    console.error("Admin transfer requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load transfer requests"
    });
  }
}