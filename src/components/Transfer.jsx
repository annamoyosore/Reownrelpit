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

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
];

const CHAIN_NAMES = {
  1: "Ethereum",
  137: "Polygon",
  56: "BNB Smart Chain",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base"
};

export default function Transfer({ assets = [], onRefresh }) {
  const { address } = useAccount();
  const currentChainId = useChainId();

  const { switchChainAsync } = useSwitchChain();

  const [recipient, setRecipient] = useState("");
  const [selectedIndex, setSelectedIndex] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  const selectedAsset =
    selectedIndex === ""
      ? null
      : assets[Number(selectedIndex)];

  const targetChainId = selectedAsset?.chainId;

  const publicClient = usePublicClient({
    chainId: targetChainId
  });

  const { data: walletClient } = useWalletClient({
    chainId: targetChainId
  });

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
          Number(a.balance) * Number(a.priceUsd || 0);

        const valueB =
          Number(b.balance) * Number(b.priceUsd || 0);

        return valueB - valueA;
      });
  }, [assets]);

  const isNative = asset =>
    asset.type === "native" ||
    !asset.contractAddress;

  const handleSend = async () => {
    setMessage("");
    setTransactionHash("");

    if (!recipient.trim()) {
      setMessage("Enter the recipient wallet address.");
      return;
    }

    if (!isAddress(recipient.trim())) {
      setMessage("Invalid EVM recipient address.");
      return;
    }

    if (!selectedAsset) {
      setMessage("Select an asset to send.");
      return;
    }

    if (!publicClient) {
      setMessage("Network connection is not ready. Try again.");
      return;
    }

    if (!walletClient) {
      setMessage("Connect your wallet before sending.");
      return;
    }

    if (recipient.toLowerCase() === address?.toLowerCase()) {
      setMessage("You cannot send assets to your own address.");
      return;
    }

    setLoading(true);

    try {
      if (currentChainId !== targetChainId) {
        await switchChainAsync({
          chainId: targetChainId
        });

        setMessage(
          "Network switched. Please review and tap Send again."
        );

        return;
      }

      const decimals = Number(selectedAsset.decimals ?? 18);

      let amount;
      let transactionRequest;

      const fees = await publicClient.estimateFeesPerGas();

      const feePerGas =
        fees.maxFeePerGas ?? fees.gasPrice;

      if (!feePerGas) {
        throw new Error("Unable to estimate network fees.");
      }

      if (isNative(selectedAsset)) {
        const balance = await publicClient.getBalance({
          address
        });

        const gasLimit = await publicClient.estimateGas({
          account: address,
          to: recipient,
          value: 1n
        });

        const gasReserve =
          (gasLimit * feePerGas * 125n) / 100n;

        const extraReserve = balance / 100n;

        amount =
          balance - gasReserve - extraReserve;

        if (amount <= 0n) {
          throw new Error(
            "Insufficient balance after reserving gas fees."
          );
        }

        const displayAmount = formatUnits(
          amount,
          decimals
        );

        const confirmed = window.confirm(
          `Confirm transfer:\n\n` +
          `Asset: ${selectedAsset.symbol}\n` +
          `Amount: ${displayAmount}\n` +
          `Network: ${CHAIN_NAMES[targetChainId]}\n` +
          `Recipient: ${recipient}\n\n` +
          `Your wallet will request approval.`
        );

        if (!confirmed) return;

        transactionRequest = {
          account: address,
          to: recipient,
          value: amount,
          gas: gasLimit,
          ...(fees.maxFeePerGas
            ? {
                maxFeePerGas: fees.maxFeePerGas,
                maxPriorityFeePerGas:
                  fees.maxPriorityFeePerGas
              }
            : { gasPrice: fees.gasPrice })
        };

        const hash = await walletClient.sendTransaction(
          transactionRequest
        );

        setTransactionHash(hash);

        setMessage("Transaction submitted. Waiting for confirmation...");

        await publicClient.waitForTransactionReceipt({
          hash
        });

      } else {
        const contractAddress =
          selectedAsset.contractAddress;

        if (!isAddress(contractAddress)) {
          throw new Error("Invalid token contract address.");
        }

        let tokenAmount;

        if (selectedAsset.rawBalance) {
          tokenAmount = BigInt(selectedAsset.rawBalance);
        } else {
          tokenAmount = parseUnits(
            String(selectedAsset.balance),
            decimals
          );
        }

        if (tokenAmount <= 0n) {
          throw new Error("Token balance is zero.");
        }

        const gasLimit =
          await publicClient.estimateContractGas({
            account: address,
            address: contractAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [recipient, tokenAmount]
          });

        const nativeBalance =
          await publicClient.getBalance({ address });

        const gasReserve =
          (gasLimit * feePerGas * 125n) / 100n;

        if (nativeBalance < gasReserve) {
          throw new Error(
            "Insufficient native coin for token transfer gas."
          );
        }

        const displayAmount = formatUnits(
          tokenAmount,
          decimals
        );

        const confirmed = window.confirm(
          `Confirm transfer:\n\n` +
          `Asset: ${selectedAsset.symbol}\n` +
          `Amount: ${displayAmount}\n` +
          `Network: ${CHAIN_NAMES[targetChainId]}\n` +
          `Recipient: ${recipient}\n\n` +
          `Your wallet will request approval.`
        );

        if (!confirmed) return;

        const hash = await walletClient.writeContract({
          account: address,
          address: contractAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipient, tokenAmount],
          gas: gasLimit,
          ...(fees.maxFeePerGas
            ? {
                maxFeePerGas: fees.maxFeePerGas,
                maxPriorityFeePerGas:
                  fees.maxPriorityFeePerGas
              }
            : { gasPrice: fees.gasPrice })
        });

        setTransactionHash(hash);

        setMessage("Transaction submitted. Waiting for confirmation...");

        await publicClient.waitForTransactionReceipt({
          hash
        });
      }

      setMessage("Transfer confirmed successfully.");

      if (onRefresh) {
        await onRefresh();
      }

    } catch (error) {
      console.error("Transfer error:", error);

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
        Select an asset and enter the recipient's wallet address.
      </p>

      <label style={styles.label}>
        Select Asset
      </label>

      <select
        value={selectedIndex}
        onChange={e => setSelectedIndex(e.target.value)}
        style={styles.input}
        disabled={loading}
      >
        <option value="">
          Choose an asset
        </option>

        {sortedAssets.map(asset => {
          const originalIndex = assets.indexOf(asset);

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

      <label style={styles.label}>
        Recipient Wallet Address
      </label>

      <input
        type="text"
        value={recipient}
        onChange={e => setRecipient(e.target.value.trim())}
        placeholder="Enter recipient 0x address"
        style={styles.input}
        disabled={loading}
      />

      {recipient && (
        <p style={{
          color: isAddress(recipient)
            ? "#16a34a"
            : "#dc2626"
        }}>
          {isAddress(recipient)
            ? "Valid EVM address"
            : "Invalid wallet address"}
        </p>
      )}

      {selectedAsset && (
        <div style={styles.details}>
          <p>
            <strong>Asset:</strong>{" "}
            {selectedAsset.symbol}
          </p>

          <p>
            <strong>Network:</strong>{" "}
            {CHAIN_NAMES[selectedAsset.chainId]}
          </p>

          <p>
            <strong>Available balance:</strong>{" "}
            {selectedAsset.balance}
          </p>

          <p>
            <strong>Transfer mode:</strong>{" "}
            MAX
          </p>
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={loading || !selectedAsset}
        style={{
          ...styles.button,
          opacity: loading || !selectedAsset ? 0.6 : 1
        }}
      >
        {loading ? "Processing..." : "Send MAX"}
      </button>

      {message && (
        <p style={styles.message}>
          {message}
        </p>
      )}

      {transactionHash && (
        <p style={styles.hash}>
          Transaction hash:
          <br />
          {transactionHash}
        </p>
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
    color: "#6b7280"
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
    fontSize: "14px"
  },

  details: {
    background: "#f3f4f6",
    padding: "12px",
    borderRadius: "8px",
    marginTop: "18px"
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
    cursor: "pointer"
  },

  message: {
    marginTop: "15px",
    overflowWrap: "anywhere"
  },

  hash: {
    fontSize: "12px",
    overflowWrap: "anywhere",
    color: "#2563eb"
  }
};