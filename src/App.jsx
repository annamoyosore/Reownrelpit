import React, {
useState,
useEffect,
useCallback,
useRef
} from "react";

import { useAppKitAccount } from "@reown/appkit/react";

import {
getWalletPortfolio,
getSolanaWalletPortfolio
} from "./services/balanceService.js";

import Transfer from "./components/Transfer.jsx";

const NETWORKS = [
"Ethereum",
"Polygon",
"BNB Smart Chain",
"Arbitrum",
"Optimism",
"Base"
];

function App() {
const {
address,
isConnected,
caipAddress
} = useAppKitAccount();

const [portfolio, setPortfolio] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [showZero, setShowZero] = useState(false);
const [activePage, setActivePage] = useState("portfolio");
const [recordStatus, setRecordStatus] = useState("");

const recordedWallet = useRef("");

// Detect wallet type
const isSolana = caipAddress?.startsWith("solana:");

const isEvm =
isConnected &&
!isSolana &&
address?.startsWith("0x");

// Save wallet connection to Appwrite
const recordWallet = useCallback(async () => {
if (!isConnected || !address || !caipAddress) return;

const walletKey = `${address}-${caipAddress}`;

if (recordedWallet.current === walletKey) return;

recordedWallet.current = walletKey;

try {
  setRecordStatus("Recording wallet...");

  const solanaWallet =
    caipAddress.startsWith("solana:");

  const chainId = solanaWallet
    ? 0
    : Number(caipAddress.split(":")[1]) || 0;

  const networkNames = {
    1: "Ethereum",
    137: "Polygon",
    56: "BNB Smart Chain",
    42161: "Arbitrum",
    10: "Optimism",
    8453: "Base"
  };

  const network = solanaWallet
    ? "Solana"
    : networkNames[chainId] || `Chain ${chainId}`;

  const response = await fetch("/api/wallet-connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      walletAddress: address,
      network,
      chainId,
      connectionStatus: "connected"
    })
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(
      result.error || "Wallet recording failed"
    );
  }

  setRecordStatus("Wallet successfully recorded");

} catch (err) {
  recordedWallet.current = "";

  console.error("Wallet recording error:", err);

  setRecordStatus("Recording failed: " + err.message);
}

}, [address, isConnected, caipAddress]);

useEffect(() => {
if (isConnected && address && caipAddress) {
recordWallet();
} else {
recordedWallet.current = "";
setRecordStatus("");
}
}, [isConnected, address, caipAddress, recordWallet]);

// Scan EVM and Solana wallet balances
const scanWallet = useCallback(async () => {
if ((!isEvm && !isSolana) || !address) return;

setLoading(true);
setError("");

try {
  const result = isSolana
    ? await getSolanaWalletPortfolio(address)
    : await getWalletPortfolio(address);

  setPortfolio(result);

} catch (err) {
  console.error("Wallet scanning error:", err);

  setPortfolio(null);

  setError(
    err.message || "Unable to scan wallet"
  );

} finally {
  setLoading(false);
}

}, [address, isEvm, isSolana]);

// Automatically scan when wallet connects or changes
useEffect(() => {
setPortfolio(null);
setError("");
setActivePage("portfolio");

if (isEvm || isSolana) {
  scanWallet();
}

}, [address, isEvm, isSolana, scanWallet]);

// Portfolio assets
const assets = portfolio?.assets || [];

const visibleAssets = showZero
? assets
: assets.filter(
asset => Number(asset.balance) > 0
);

const networkStatus = portfolio?.networks || [];

// Format balances
const formatBalance = value => {
const number = Number(value);

if (!Number.isFinite(number)) return value;

return number.toLocaleString("en-US", {
  maximumFractionDigits: 8
});

};

return (
<div style={styles.page}>

  {/* HEADER */}

  <header style={styles.header}>

    <h2 style={styles.logo}>
      MultiChain Wallet
    </h2>

    <appkit-button />

  </header>

  {!isConnected ? (

    /* DISCONNECTED */

    <section style={styles.center}>

      <h1>Welcome to MultiChain Wallet</h1>

      <p>
        Connect your wallet to discover
        cryptocurrency balances across multiple networks.
      </p>

      <appkit-button />

    </section>

  ) : (

    <main style={styles.container}>

      {/* CONNECTED WALLET */}

      <section style={styles.card}>

        <h3>Connected Wallet</h3>

        <p style={styles.address}>
          {address}
        </p>

        <p>
          Wallet type: {isSolana ? "Solana" : "EVM"}
        </p>

        <p style={styles.status}>
          Wallet connected
        </p>

        <p
          style={{
            color: recordStatus.includes("failed")
              ? "#dc2626"
              : "#16a34a"
          }}
        >
          {recordStatus}
        </p>

      </section>

      {isSolana ? (

        /* SOLANA PORTFOLIO */

        <>

          <section style={styles.card}>

            <div style={styles.sectionHeader}>

              <h2>Solana Portfolio</h2>

              <button
                onClick={scanWallet}
                disabled={loading}
                style={styles.refreshButton}
              >
                {loading ? "Scanning..." : "↻ Refresh"}
              </button>

            </div>

            {loading && (
              <p>
                Scanning your Solana wallet...
              </p>
            )}

            {error && (
              <p style={styles.error}>
                {error}
              </p>
            )}

            {portfolio && (

              <>

                <h1 style={styles.assetCount}>
                  {visibleAssets.length}
                </h1>

                <p>Detected Solana assets</p>

                <p style={styles.smallText}>
                  Last updated:{" "}
                  {new Date(
                    portfolio.updatedAt
                  ).toLocaleString()}
                </p>

              </>

            )}

          </section>

          {/* SOLANA NETWORK STATUS */}

          <section style={styles.card}>

            <h2>Network Status</h2>

            <div style={styles.networkRow}>

              <span>Solana Mainnet</span>

              <span
                style={{
                  color: !portfolio
                    ? "#999"
                    : networkStatus.some(
                        item => item.success
                      )
                    ? "#16a34a"
                    : "#dc2626"
                }}
              >
                {!portfolio
                  ? loading
                    ? "Scanning"
                    : "Waiting"
                  : networkStatus.some(
                      item => item.success
                    )
                  ? "Connected"
                  : "Unavailable"}
              </span>

            </div>

          </section>

          {/* SOLANA ASSETS */}

          <section style={styles.card}>

            <div style={styles.sectionHeader}>

              <h2>SOL & SPL Tokens</h2>

              <label style={styles.toggle}>

                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={event =>
                    setShowZero(event.target.checked)
                  }
                />

                Show zero balances

              </label>

            </div>

            {visibleAssets.length === 0 && !loading ? (

              <p>
                No Solana assets found.
              </p>

            ) : (

              visibleAssets.map((asset, index) => (

                <div
                  key={`${asset.contractAddress || "SOL"}-${index}`}
                  style={styles.assetRow}
                >

                  <div style={styles.assetInfo}>

                    {asset.logo && (

                      <img
                        src={asset.logo}
                        alt=""
                        style={styles.tokenLogo}
                      />

                    )}

                    <div>

                      <strong>{asset.name}</strong>

                      <p style={styles.smallText}>
                        {asset.symbol}
                      </p>

                    </div>

                  </div>

                  <div style={styles.assetBalance}>

                    <strong>
                      {formatBalance(asset.balance)}
                    </strong>

                    <p style={styles.smallText}>
                      {asset.type === "native"
                        ? "Native SOL"
                        : "SPL Token"}
                    </p>

                  </div>

                  <div style={styles.assetNetwork}>

                    <p>Solana</p>

                    {asset.contractAddress && (

                      <small style={styles.smallText}>
                        {asset.contractAddress.slice(0, 8)}
                        ...
                        {asset.contractAddress.slice(-6)}
                      </small>

                    )}

                  </div>

                </div>

              ))

            )}

          </section>

          <p style={styles.warning}>
            Solana transfers are not yet enabled.
          </p>

        </>

      ) : isEvm ? (

        /* EVM PORTFOLIO */

        <>

          <nav style={styles.navigation}>

            <button
              onClick={() => setActivePage("portfolio")}
              style={
                activePage === "portfolio"
                  ? styles.activeNav
                  : styles.navButton
              }
            >
              Portfolio
            </button>

            <button
              onClick={() => setActivePage("send")}
              style={
                activePage === "send"
                  ? styles.activeNav
                  : styles.navButton
              }
            >
              Send Assets
            </button>

          </nav>

          {activePage === "portfolio" ? (

            <>

              {/* PORTFOLIO SUMMARY */}

              <section style={styles.card}>

                <div style={styles.sectionHeader}>

                  <h2>Your Portfolio</h2>

                  <button
                    onClick={scanWallet}
                    disabled={loading}
                    style={styles.refreshButton}
                  >
                    {loading ? "Scanning..." : "↻ Refresh"}
                  </button>

                </div>

                {loading && (

                  <p>
                    Scanning your wallet across six networks...
                  </p>

                )}

                {error && (

                  <p style={styles.error}>
                    {error}
                  </p>

                )}

                {portfolio && (

                  <>

                    <h1 style={styles.assetCount}>
                      {visibleAssets.length}
                    </h1>

                    <p>Detected assets</p>

                    <p style={styles.smallText}>
                      Last updated:{" "}
                      {new Date(
                        portfolio.updatedAt
                      ).toLocaleString()}
                    </p>

                  </>

                )}

              </section>

              {/* EVM NETWORK STATUS */}

              <section style={styles.card}>

                <h2>Network Status</h2>

                {NETWORKS.map(network => {

                  const result = networkStatus.find(
                    item =>
                      item.name === network ||
                      item.network === network
                  );

                  return (

                    <div
                      key={network}
                      style={styles.networkRow}
                    >

                      <span>{network}</span>

                      <span
                        style={{
                          color: !portfolio
                            ? "#999"
                            : result?.success
                            ? "#16a34a"
                            : "#dc2626"
                        }}
                      >

                        {!portfolio
                          ? "Waiting"
                          : result?.success
                          ? "Connected"
                          : "Unavailable"}

                      </span>

                    </div>

                  );

                })}

              </section>

              {/* EVM ASSETS */}

              <section style={styles.card}>

                <div style={styles.sectionHeader}>

                  <h2>Your Coins & Tokens</h2>

                  <label style={styles.toggle}>

                    <input
                      type="checkbox"
                      checked={showZero}
                      onChange={event =>
                        setShowZero(event.target.checked)
                      }
                    />

                    Show zero balances

                  </label>

                </div>

                {visibleAssets.length === 0 && !loading ? (

                  <p>
                    No assets found. Refresh to scan again.
                  </p>

                ) : (

                  visibleAssets.map((asset, index) => (

                    <div
                      key={`${asset.chainId}-${asset.contractAddress || "native"}-${index}`}
                      style={styles.assetRow}
                    >

                      <div style={styles.assetInfo}>

                        {asset.logo && (

                          <img
                            src={asset.logo}
                            alt=""
                            style={styles.tokenLogo}
                          />

                        )}

                        <div>

                          <strong>{asset.name}</strong>

                          <p style={styles.smallText}>
                            {asset.symbol}
                          </p>

                        </div>

                      </div>

                      <div style={styles.assetBalance}>

                        <strong>
                          {formatBalance(asset.balance)}
                        </strong>

                        <p style={styles.smallText}>
                          {asset.type === "native"
                            ? "Native coin"
                            : "Token"}
                        </p>

                      </div>

                      <div style={styles.assetNetwork}>

                        <p>
                          {asset.network ||
                            `Chain ${asset.chainId}`}
                        </p>

                        {asset.contractAddress && (

                          <small style={styles.smallText}>
                            {asset.contractAddress.slice(0, 8)}
                            ...
                            {asset.contractAddress.slice(-6)}
                          </small>

                        )}

                      </div>

                    </div>

                  ))

                )}

              </section>

              {portfolio?.failedNetworkCount > 0 && (

                <p style={styles.warning}>
                  Some networks could not be scanned.
                  Their balances may be missing.
                </p>

              )}

            </>

          ) : (

            <Transfer
              assets={assets}
              onRefresh={scanWallet}
            />

          )}

        </>

      ) : (

        <section style={styles.card}>

          <h2>Unsupported wallet connection</h2>

          <p>
            Please connect a supported EVM or Solana wallet.
          </p>

        </section>

      )}

    </main>

  )}

  <footer style={styles.footer}>
    MultiChain Wallet © 2026
  </footer>

</div>

);
}

const styles = {

page: {
minHeight: "100vh",
background: "#f3f4f6",
color: "#111827",
fontFamily: "Arial, sans-serif"
},

header: {
background: "#111827",
color: "white",
padding: "18px 5%",
display: "flex",
justifyContent: "space-between",
alignItems: "center"
},

logo: {
margin: 0
},

container: {
maxWidth: "950px",
margin: "auto",
padding: "20px"
},

center: {
minHeight: "70vh",
display: "flex",
flexDirection: "column",
justifyContent: "center",
alignItems: "center",
textAlign: "center",
padding: "20px"
},

card: {
background: "white",
padding: "22px",
borderRadius: "14px",
marginBottom: "18px",
boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
},

navigation: {
display: "flex",
gap: "10px",
marginBottom: "18px"
},

navButton: {
flex: 1,
padding: "13px",
border: "1px solid #ddd",
borderRadius: "8px",
background: "white",
cursor: "pointer"
},

activeNav: {
flex: 1,
padding: "13px",
border: "none",
borderRadius: "8px",
background: "#2563eb",
color: "white",
fontWeight: "bold"
},

address: {
wordBreak: "break-all",
color: "#2563eb"
},

status: {
color: "#16a34a"
},

sectionHeader: {
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: "12px",
flexWrap: "wrap"
},

refreshButton: {
padding: "10px 16px",
border: "none",
borderRadius: "8px",
background: "#2563eb",
color: "white",
cursor: "pointer"
},

assetCount: {
fontSize: "40px",
marginBottom: "0"
},

networkRow: {
display: "flex",
justifyContent: "space-between",
padding: "13px 0",
borderBottom: "1px solid #eee"
},

assetRow: {
padding: "16px 0",
borderBottom: "1px solid #eee",
display: "flex",
flexWrap: "wrap",
justifyContent: "space-between",
alignItems: "center",
gap: "12px"
},

assetInfo: {
display: "flex",
alignItems: "center",
gap: "10px"
},

tokenLogo: {
width: "35px",
height: "35px",
borderRadius: "50%"
},

assetBalance: {
textAlign: "right"
},

assetNetwork: {
width: "100%",
fontSize: "12px",
color: "#6b7280"
},

smallText: {
color: "#6b7280",
fontSize: "12px",
margin: "5px 0"
},

toggle: {
fontSize: "13px"
},

error: {
color: "#dc2626"
},

warning: {
color: "#b45309",
textAlign: "center"
},

footer: {
textAlign: "center",
padding: "25px",
color: "#6b7280"
}

};

export default App;