export type TxDirection = 'received' | 'sent' | 'contract_interaction' | 'self' | 'unknown';
export type TxClassification = 'received' | 'sent' | 'contract_interaction' | 'token_transfer' | 'unknown';
export type TxStatus = 'success' | 'reverted' | 'pending';

export interface NormalizedTransaction {
  id: string;
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string | null;
  value: string; // formatted in USDC (18 decimals on Arc)
  rawValue: string; // raw wei string
  token: string; // 'USDC'
  direction: TxDirection;
  status: TxStatus;
  gasUsed: string;
  gasPrice: string;
  gasCostUSDC: string;
  isContractInteraction: boolean;
  contractAddress?: string;
  contractName?: string;
  methodName?: string;
  classification: TxClassification;
  classificationLabel: string;
  summary: string;
}

export interface WalletSummary {
  address: string;
  balanceUSDC: string;
  rawBalance: string;
  receivedTotalUSDC: string;
  sentTotalUSDC: string;
  txCount: number;
  gasSpentUSDC: string;
  activeContractsCount: number;
  uniqueCounterpartiesCount: number;
  latestActivityTime?: number;
  isDataAvailable: boolean;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  networkId: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
}

export interface AiWalletAnalysis {
  summary: string;
  keyObservations: string[];
  activityLevel: 'active' | 'moderate' | 'low' | 'new_wallet';
  largestOutgoing?: {
    amount: string;
    to: string;
    hash?: string;
  };
  largestIncoming?: {
    amount: string;
    from: string;
    hash?: string;
  };
  generatedAt: number;
  disclaimer: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  referencedTxHashes?: string[];
  isError?: boolean;
}

export interface BlockchainStatus {
  connected: boolean;
  chainId: number;
  blockNumber: number;
  latencyMs: number;
  rpcUrl: string;
  nativeCurrency: string;
  explorerUrl: string;
}
