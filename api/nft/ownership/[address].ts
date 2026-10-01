import { applyApiSecurity } from '../../_security.js';
import { getAddress, isAddress, parseEventLogs } from 'viem';
import { arcClient } from '../../../src/services/blockchain/arcService.js';

const CONTRACT = '0x8bb24be3e446302a4902e763908d439325e0003a' as const;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const FEE_RECIPIENT = '0x5bce25397eefbc76f6479e6838c00a5115dbea4c' as const;
const MINT_PRICE = 1_000_000n;

const ABI = [
  { type: 'function', name: 'hasMinted', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const TRANSFER_ABI = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  },
] as const;

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  const address = req.query.address || (req.url && req.url.split('/').pop()?.split('?')[0]);
  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  const txHash = typeof req.query.tx === 'string' ? req.query.tx : '';
  const normalizedAddress = getAddress(address);

  try {
    const hasMinted = await arcClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'hasMinted',
      args: [normalizedAddress],
    });

    const balance = await arcClient.readContract({
      address: CONTRACT,
      abi: ABI,
      functionName: 'balanceOf',
      args: [normalizedAddress],
    });

    const owned = Boolean(hasMinted) || balance > 0n;

    if (!txHash) {
      return res.status(200).json({
        address,
        contract: CONTRACT,
        owned,
        hasMinted: Boolean(hasMinted),
        balance: balance.toString(),
        paymentVerified: false,
      });
    }

    const receipt = await arcClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    const transaction = await arcClient.getTransaction({ hash: txHash as `0x${string}` });

    const interactedWithContract =
      transaction.to?.toLowerCase() === CONTRACT.toLowerCase();

    const transfers = parseEventLogs({
      abi: TRANSFER_ABI,
      logs: receipt.logs,
      strict: false,
    });

    const paymentVerified = receipt.status === 'success'
      && interactedWithContract
      && transfers.some((event) =>
        event.address.toLowerCase() === USDC.toLowerCase()
        && event.args.from?.toLowerCase() === normalizedAddress.toLowerCase()
        && event.args.to?.toLowerCase() === FEE_RECIPIENT.toLowerCase()
        && event.args.value === MINT_PRICE
      );

    return res.status(200).json({
      address,
      contract: CONTRACT,
      owned,
      hasMinted: Boolean(hasMinted),
      balance: balance.toString(),
      transactionConfirmed: receipt.status === 'success',
      interactedWithContract,
      paymentVerified,
    });
  } catch (error: any) {
    console.error('[GEN-0 Bound ownership/payment] Error:', error);
    return res.status(502).json({ error: 'Arc Mainnet ownership/payment verification unavailable' });
  }
}
