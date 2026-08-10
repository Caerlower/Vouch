/**
 * Deploy VouchEscrow to Algorand TestNet.
 *
 * Usage:
 *   VOUCH_OPERATOR_MNEMONIC="..." npx tsx --env-file=.env scripts/deploy-escrow.ts
 *   # or generate + print fund instructions when mnemonic missing
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import algosdk from "algosdk";
import {
  deployEscrowApp,
  getAlgod,
  USDC_ASA,
} from "../src/escrow-chain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env");

function upsertEnv(key: string, value: string) {
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, `${key}=${value}`);
  } else {
    text = `${text.trimEnd()}\n\n${key}=${value}\n`;
  }
  writeFileSync(envPath, text);
  console.log(`wrote ${key} to .env`);
}

async function main() {
  let mnemonic = process.env.VOUCH_OPERATOR_MNEMONIC?.trim();
  if (!mnemonic) {
    const acct = algosdk.generateAccount();
    mnemonic = algosdk.secretKeyToMnemonic(acct.sk);
    console.log("Generated new operator account:");
    console.log("  address:", acct.addr.toString());
    console.log("  mnemonic: (saved to .env as VOUCH_OPERATOR_MNEMONIC)");
    upsertEnv("VOUCH_OPERATOR_MNEMONIC", mnemonic);
    upsertEnv("VOUCH_OPERATOR_ADDRESS", acct.addr.toString());
    console.log("");
    console.log("Fund this address with ≥1.5 TestNet ALGO, then re-run:");
    console.log("  https://lora.algokit.io/testnet/dispenser");
    console.log("  npm run deploy:escrow");
    process.exit(2);
  }

  const operator = algosdk.mnemonicToSecretKey(mnemonic);
  const addr = operator.addr.toString();
  console.log("Operator:", addr);

  const algod = getAlgod();
  const info = await algod.accountInformation(addr).do();
  const amount = Number(info.amount || 0);
  console.log("Balance:", amount / 1e6, "ALGO");
  if (amount < 1_500_000) {
    console.error("");
    console.error(`Operator needs ≥1.5 TestNet ALGO (have ${(amount / 1e6).toFixed(3)}).`);
    console.error(`Fund: ${addr}`);
    console.error("     https://lora.algokit.io/testnet/dispenser");
    console.error("Then re-run: npm run deploy:escrow");
    console.error("");
    process.exit(2);
  }

  console.log("Deploying VouchEscrow (USDC ASA", USDC_ASA, ")…");
  const result = await deployEscrowApp(operator, USDC_ASA);
  console.log("Deployed:");
  console.log("  appId:", result.appId);
  console.log("  appAddress:", result.appAddress);
  console.log("  createTx:", result.createTxId);
  console.log("  fundTx:", result.fundTxId);
  console.log("  bootstrapTx:", result.bootstrapTxId);

  upsertEnv("ESCROW_APP_ID", String(result.appId));
  upsertEnv("VOUCH_OPERATOR_ADDRESS", result.operator);
  upsertEnv("USDC_ASA_ID", String(USDC_ASA));

  const deployLog = join(
    __dirname,
    "../../../contracts/escrow/out/deployed.json",
  );
  writeFileSync(
    deployLog,
    JSON.stringify({ ...result, network: "algorand-testnet", assetId: USDC_ASA }, null, 2),
  );
  console.log("Wrote", deployLog);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
