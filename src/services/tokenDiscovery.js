export async function discoverEvmAssets(address) {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM wallet address");
  }

  const response = await fetch("/api/evm-balances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ address })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to retrieve wallet balances"
    );
  }

  return data;
}