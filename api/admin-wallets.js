const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const TABLE_ID = process.env.APPWRITE_TABLE_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export default async function handler(req, res) {
res.setHeader("Cache-Control", "no-store");

if (req.method !== "POST") {
return res.status(405).json({
success: false,
error: "Method not allowed"
});
}

// Check server configuration.
if (
!ENDPOINT ||
!PROJECT_ID ||
!DATABASE_ID ||
!TABLE_ID ||
!API_KEY ||
!ADMIN_EMAIL
) {
console.error("Missing server environment variables.");

return res.status(500).json({
  success: false,
  error: "Server configuration is incomplete."
});

}

try {
// Get email supplied by user.
const { email } = req.body || {};

const suppliedEmail = (email || "").trim().toLowerCase();
const adminEmail = ADMIN_EMAIL.trim().toLowerCase();

// Verify administrator email.
if (!suppliedEmail || suppliedEmail !== adminEmail) {
  return res.status(403).json({
    success: false,
    error: "Unauthorised access"
  });
}

// Retrieve wallet records from Appwrite.
const url =
  `${ENDPOINT}/tablesdb/databases/${DATABASE_ID}` +
  `/tables/${TABLE_ID}/rows`;

const searchUrl = new URL(url);

// Retrieve up to 100 wallet records.
searchUrl.searchParams.append(
  "queries[]",
  JSON.stringify({
    method: "limit",
    values: [100]
  })
);

const response = await fetch(searchUrl.toString(), {
  method: "GET",
  headers: {
    "X-Appwrite-Project": PROJECT_ID,
    "X-Appwrite-Key": API_KEY
  }
});

const result = await response.json();

if (!response.ok) {
  console.error("Appwrite wallet retrieval error:", result);

  return res.status(502).json({
    success: false,
    error: result.message || "Unable to retrieve wallet records"
  });
}

// Get returned wallet records.
const wallets = Array.isArray(result.rows)
  ? result.rows
  : [];

// Sort newest activity first.
wallets.sort((a, b) => {
  return (
    new Date(b.lastSeenAt || 0).getTime() -
    new Date(a.lastSeenAt || 0).getTime()
  );
});

return res.status(200).json({
  success: true,
  authorised: true,
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