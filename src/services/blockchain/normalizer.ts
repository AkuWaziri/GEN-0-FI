import { formatUnits } from 'viem';
import { NormalizedTransaction, TxClassification, TxDirection, TxStatus } from '../../types/blockchain.js';
import { formatShortAddress } from '../../config/arc.js';

export interface RawTxInput {
  hash: string;
  blockNumber: bigint | number;
  from: string;
  to: string | null;
  value: bigint | string;
  fee?: bigint | string;
  gas?: bigint | string;
  gasPrice?: bigint | string;
  gasUsed?: bigint | string;
  input?: string;
  timestamp?: number;
  status?: number | string | boolean;
  contractAddress?: string | null;
  methodId?: string;
  functionName?: string;
}

export function normalizeTransaction(raw: RawTxInput, userAddress: string): NormalizedTransaction {
  const normUser = userAddress.toLowerCase();
  const from = (raw.from || '').toLowerCase();
  const to = raw.to ? raw.to.toLowerCase() : null;
  const hasCallData = Boolean((raw.input && raw.input !== '0x' && raw.input !== '0x0') || (raw.methodId && raw.methodId !== '0x00000000'));
  const isContractCreation = !raw.to && !!raw.contractAddress;

  let direction: TxDirection = 'unknown';
  if (from === normUser && to === normUser) direction = 'self';
  else if (from === normUser) direction = hasCallData || isContractCreation ? 'contract_interaction' : 'sent';
  else if (to === normUser) direction = 'received';

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

  let rawValueStr = '0';
  let formattedValue = '0.00';
  try {
    rawValueStr = typeof raw.value === 'bigint'
      ? raw.value.toString()
      : raw.value.startsWith('0x') ? BigInt(raw.value).toString() : raw.value;
    formattedValue = formatUnits(BigInt(rawValueStr), 18);

    const numVal = parseFloat(formattedValue);
    formattedValue = !Number.isFinite(numVal) || numVal === 0
      ? '0'
      : numVal < 0.0001
        ? numVal.toFixed(6)
        : numVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch {
    formattedValue = '0.00';
  }

  let gasCostUSDC = 'Unavailable';
  let gasUsedStr = '0';
  let gasPriceStr = '0';
  try {
    if (raw.fee !== undefined) {
      gasCostUSDC = Number(formatUnits(typeof raw.fee === 'bigint' ? raw.fee : BigInt(raw.fee), 18)).toFixed(6);
    } else if (raw.gasUsed !== undefined && raw.gasPrice !== undefined) {
      const gasUsed = typeof raw.gasUsed === 'bigint' ? raw.gasUsed : BigInt(raw.gasUsed);
      const gasPrice = typeof raw.gasPrice === 'bigint' ? raw.gasPrice : BigInt(raw.gasPrice);
      gasUsedStr = gasUsed.toString();
      gasPriceStr = gasPrice.toString();
      gasCostUSDC = Number(formatUnits(gasUsed * gasPrice, 18)).toFixed(6);
    }
  } catch {
    gasCostUSDC = 'Unavailable';
  }

  let status: TxStatus = 'pending';
  if (raw.status !== undefined) {
    if (raw.status === 0 || raw.status === '0x0' || raw.status === false || raw.status === 'reverted' || raw.status === 'error') status = 'reverted';
    else if (raw.status === 1 || raw.status === '0x1' || raw.status === true || raw.status === 'success' || raw.status === 'ok') status = 'success';
    else status = 'pending';
  }

  const timestamp = raw.timestamp || 0;
  let summary = 'Transaction on Arc';
  if (classification === 'received') summary = `Received ${formattedValue} USDC from ${formatShortAddress(raw.from)}`;
  else if (classification === 'sent') summary = `Sent ${formattedValue} USDC to ${raw.to ? formatShortAddress(raw.to) : 'contract'}`;
  else if (classification === 'contract_interaction') summary = isContractCreation
    ? 'Deployed new smart contract'
    : `Interacted with contract ${raw.to ? formatShortAddress(raw.to) : 'contract'}`;

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
  return new Date(timestampMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
