import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARC_CHAIN_ID = 5042;
const ARC_RPC_URL = "https://rpc.mainnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const FEE_RECIPIENT = "0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c";
const METADATA_URI =
  "ipfs://bafkreibcmwuncoiw2fjfraxj7kyp6s56sqbnyiqx72i55jmwmmzpenuudm";

const privateKey = process.env.ARC_DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  throw new Error("Missing GitHub Actions secret: ARC_DEPLOYER_PRIVATE_KEY");
}

const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
  throw new Error("ARC_DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key");
}

const arc = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

const sourcePath = path.resolve("contracts/Gen0BoundNFTV2.sol");
const source = fs.readFileSync(sourcePath, "utf8");

function findImports(importPath) {
  const candidates = [
    path.resolve("node_modules", importPath),
    path.resolve(
      "node_modules/@openzeppelin/contracts",
      importPath.startsWith("@openzeppelin/contracts/")
        ? importPath.slice("@openzeppelin/contracts/".length)
        : importPath
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }

  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: {
    "contracts/Gen0BoundNFTV2.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const compiled = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports })
);

if (compiled.errors) {
  const errors = compiled.errors.filter((e) => e.severity === "error");
  for (const error of compiled.errors) console.log(error.formattedMessage);
  if (errors.length) throw new Error("Solidity compilation failed");
}

const artifact =
  compiled.contracts["contracts/Gen0BoundNFTV2.sol"]?.Gen0BoundNFTV2;

if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
  throw new Error("Gen0BoundNFTV2 artifact was not produced");
}

const bytecode = `0x${artifact.evm.bytecode.object}`;
const account = privateKeyToAccount(normalizedKey);

console.log("GEN-0 Bound NFT V2 deployment");
console.log("Network: Arc Mainnet");
console.log("Chain ID:", ARC_CHAIN_ID);
console.log("Deployer:", account.address);
console.log("USDC:", USDC);
console.log("Fee recipient:", FEE_RECIPIENT);
console.log("Metadata:", METADATA_URI);

const publicClient = createPublicClient({
  chain: arc,
  transport: http(ARC_RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: arc,
  transport: http(ARC_RPC_URL),
});

const chainId = await publicClient.getChainId();
if (chainId !== ARC_CHAIN_ID) {
  throw new Error(`RPC returned chain ID ${chainId}, expected ${ARC_CHAIN_ID}`);
}

const balance = await publicClient.getBalance({ address: account.address });
console.log("Deployer native balance:", balance.toString());

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode,
  args: [USDC, FEE_RECIPIENT, METADATA_URI],
});

console.log("Deployment transaction:", hash);
console.log("Explorer:", `https://explorer.arc.io/tx/${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  throw new Error("Deployment transaction did not succeed");
}

if (!receipt.contractAddress) {
  throw new Error("Deployment succeeded but no contract address was returned");
}

const address = receipt.contractAddress;

const contract = getContract({
  address,
  abi: artifact.abi,
  client: publicClient,
});

const [name, symbol, usdc, feeRecipient, metadataURI, mintPrice] =
  await Promise.all([
    contract.read.name(),
    contract.read.symbol(),
    contract.read.usdc(),
    contract.read.feeRecipient(),
    contract.read.metadataURI(),
    contract.read.MINT_PRICE(),
  ]);

if (
  name !== "GEN-0 Bound" ||
  symbol !== "GEN0B" ||
  usdc.toLowerCase() !== USDC.toLowerCase() ||
  feeRecipient.toLowerCase() !== FEE_RECIPIENT.toLowerCase() ||
  metadataURI !== METADATA_URI ||
  mintPrice !== 1_000_000n
) {
  throw new Error("Post-deployment verification failed");
}

console.log("");
console.log("DEPLOYMENT SUCCESS");
console.log("Contract address:", address);
console.log("Transaction hash:", hash);
console.log("Explorer:", `https://explorer.arc.io/address/${address}`);
console.log("Verified constructor configuration:");
console.log("  USDC:", usdc);
console.log("  Fee recipient:", feeRecipient);
console.log("  Metadata URI:", metadataURI);
console.log("  Mint price:", mintPrice.toString());
