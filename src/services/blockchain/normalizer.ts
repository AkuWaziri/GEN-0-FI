import { formatUnits } from 'viem';
import { NormalizedTransaction, TxClassification, TxDirection, TxStatus } from '../../types/blockchain';
import { formatShortAddress } from '../../config/arc';

export interface RawTxInput {
  hash: string;
  blockNumber: bigint | number;
  from: string;
  to: string | null;
  value: bigint | string;
  gas?: bigint | string;
  gasPrice?: bigint | string;
  gasUsed?: bigint | string;
  input?: string;
  timestamp?: number;
  status?: number | string | boolean;
  contractAddress?: string | null;
}

/**
 * Normalizes raw EVM / Arc transaction into structured, human-readable format.
 */
export function normalizeTransaction(raw: RawTxInput, userAddress: string): NormalizedTransaction {
  const normUser = userAddress.toLowerCase();
  const from = (raw.from || '').toLowerCase();
  const to = raw.to ? raw.to.toLowerCase() : null;

  // Determine direction
  let direction: TxDirection = 'unknown';
  const hasCallData = raw.input && raw.input !== '0x' && raw.input !== '0x0';
  const isContractCreation = !raw.to && !!raw.contractAddress;

  if (from === normUser && to === normUser) {
    direction = 'self';
  } else if (from === normUser) {
    if (hasCallData || isContractCreation) {
      direction = 'contract_interaction';
    } else {
      direction = 'sent';
    }
  } else if (to === normUser) {
    direction = 'received';
  } else {
    direction = 'unknown';
  }

  // Classification
  let classification: TxClassification = 'unknown';
  let classificationLabel = 'Unknown activity';

  if (direction === 'received') {
    classification = 'received';
    classificationLabel = 'Received';
  } else if (direction === 'sent') {
    classification = 'sent';
    classificationLabel = 'Sent';
  } else if (direction === 'contract_interaction' || isContractCreation || hasCallData) {
    classification = 'contract_interaction';
    classificationLabel = isContractCreation ? 'Contract creation' : 'Contract interaction';
  } else if (direction === 'self') {
    classification = 'sent';
    classificationLabel = 'Self-transfer';
  }

  // Value formatting (Native USDC has 18 decimals on Arc)
  let rawValueStr = '0';
  let formattedValue = '0.00';
  try {
    if (typeof raw.value === 'bigint') {
      rawValueStr = raw.value.toString();
      formattedValue = formatUnits(raw.value, 18);
    } else if (typeof raw.value === 'string') {
      rawValueStr = raw.value.startsWith('0x') ? BigInt(raw.value).toString() : raw.value;
      formattedValue = formatUnits(BigInt(rawValueStr), 18);
    }
    // Clean precision up to 4 decimals, or 6 if very small
    const numVal = parseFloat(formattedValue);
    if (numVal === 0) {
      formattedValue = '0';
    } else if (numVal < 0.0001) {
      formattedValue = numVal.toFixed(6);
    } else {
      formattedValue = numVal.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    }
  } catch {
    formattedValue = '0.00';
  }

  // Gas calculation in USDC (18 decimals)
  let gasCostUSDC = '0.00';
  let gasUsedStr = '0';
  let gasPriceStr = '0';
  try {
    const gasUsed = raw.gasUsed ? (typeof raw.gasUsed === 'bigint' ? raw.gasUsed : BigInt(raw.gasUsed)) : 21000n;
    const gasPrice = raw.gasPrice ? (typeof raw.gasPrice === 'bigint' ? raw.gasPrice : BigInt(raw.gasPrice)) : 1000000000n;
    gasUsedStr = gasUsed.toString();
    gasPriceStr = gasPrice.toString();
    const totalGasCostWei = gasUsed * gasPrice;
    const gasUnits = formatUnits(totalGasCostWei, 18);
    gasCostUSDC = parseFloat(gasUnits).toFixed(6);
  } catch {
    gasCostUSDC = '0.000000';
  }

  // Status check
  let status: TxStatus = 'success';
  if (raw.status !== undefined) {
    if (raw.status === 0 || raw.status === '0x0' || raw.status === false || raw.status === 'reverted') {
      status = 'reverted';
    } else if (raw.status === 1 || raw.status === '0x1' || raw.status === true || raw.status === 'success') {
      status = 'success';
    } else {
      status = 'pending';
    }
  }

  // Block timestamp
  const timestamp = raw.timestamp || Date.now();

  // Construct clear human-readable summary
  let summary = '';
  if (classification === 'received') {
    summary = `Received ${formattedValue} USDC from ${formatShortAddress(raw.from)}`;
  } else if (classification === 'sent') {
    summary = `Sent ${formattedValue} USDC to ${raw.to ? formatShortAddress(raw.to) : 'contract'}`;
  } else if (classification === 'contract_interaction') {
    summary = isContractCreation
      ? 'Deployed new smart contract'
      : `Interacted with contract ${raw.to ? formatShortAddress(raw.to) : 'contract'}`;
  } else {
    summary = `Transaction on Arc Testnet`;
  }

  return {
    id: raw.hash,
    hash: raw.hash,
    blockNumber: Number(raw.blockNumber || 0),
    timestamp,
    from: raw.from,
    to: raw.to,
    value: formattedValue,
    rawValue: rawValueStr,
    token: 'USDC',
    direction,
    status,
    gasUsed: gasUsedStr,
    gasPrice: gasPriceStr,
    gasCostUSDC,
    isContractInteraction: direction === 'contract_interaction' || hasCallData,
    contractAddress: raw.contractAddress || (direction === 'contract_interaction' && raw.to ? raw.to : undefined),
    classification,
    classificationLabel,
    summary,
  };
}

export function formatTimeAgo(timestampMs: number): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestampMs);
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;

  return new Date(timestampMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
