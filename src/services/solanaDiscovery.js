export async function discoverSolanaAssets(address) {
  if (
    !address ||
    !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  ) {
    throw new Error("Invalid Solana wallet address");
  }

  const response = await fetch("/api/solana-balances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ address })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to retrieve Solana balances"
    );
  }

  return data;
}