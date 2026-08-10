import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import {
  NetworkConfigBuilder,
  NetworkId,
  WalletId,
  WalletManager,
  WalletProvider,
} from "@txnlab/use-wallet-react";
import { WalletUIProvider } from "@txnlab/use-wallet-ui-react";
import "@txnlab/use-wallet-ui-react/dist/style.css";
import App from "./App";
import { ALGOD_TOKEN, getAlgodBaseServer } from "./lib/algod";
import "./index.css";

// x402-avm Exact scheme uses Node Buffer in the browser
if (!(globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

const networks = new NetworkConfigBuilder()
  .testnet({
    algod: {
      token: ALGOD_TOKEN,
      // Host only — no ":port" (see lib/algod.ts). Genesis id comes from defaults.
      baseServer: getAlgodBaseServer(),
    },
  })
  .build();

const walletManager = new WalletManager({
  wallets: [
    {
      id: WalletId.LUTE,
      options: {
        siteName: "Vouch",
      },
    },
    {
      id: WalletId.PERA,
      options: {
        chainId: 416002, // Algorand TestNet
        shouldShowSignTxnToast: false,
      },
    },
    {
      id: WalletId.DEFLY,
      options: {
        chainId: 416002,
        shouldShowSignTxnToast: false,
      },
    },
  ],
  networks,
  defaultNetwork: NetworkId.TESTNET,
  options: {
    resetNetwork: true,
  },
});

// Clear stale persisted algod (e.g. broken localhost:5173/algod proxy URL).
// use-wallet merges customNetworkConfigs from localStorage on boot.
walletManager.resetNetworkConfig(NetworkId.TESTNET);

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <WalletProvider manager={walletManager}>
      <WalletUIProvider theme="light">
        <App />
      </WalletUIProvider>
    </WalletProvider>
  </StrictMode>,
);
