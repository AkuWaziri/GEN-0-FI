import React, { useCallback, useEffect, useState } from 'react';
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { Flame, Loader2, Trophy, CheckCircle2, ExternalLink } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL } from '../../config/arc';
import { GM_DATA, GM_FEE_ADDRESS } from '../../services/gm/gmService';

interface GmStatus {
  gmCount: number;
  streak: number;
  points: number;
  lastGmAt: number | null;
  nextGmAt: number | null;
  canGm: boolean;
}

const initialStatus: GmStatus = {
  gmCount: 0,
  streak: 0,
  points: 0,
  lastGmAt: null,
  nextGmAt: null,
  canGm: true,
};

function formatCountdown(target: number | null) {
  if (!target) return 'Ready now';
  const remaining = Math.max(0, target - Date.now());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export const GMStreakView: React.FC = () => {
  const { address } = useWallet();
  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: ARC_MAINNET_CHAIN_ID,
  });
  const [status, setStatus] = useState<GmStatus>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState('Ready now');

  const loadStatus = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/gm/status/${address}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('GM status unavailable');
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch {
      setError('Could not verify your GM history from Arc Mainnet.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(status.nextGmAt));
    }, 30_000);
    setCountdown(formatCountdown(status.nextGmAt));
    return () => window.clearInterval(timer);
  }, [status.nextGmAt]);

  useEffect(() => {
    if (isConfirmed) {
      setTxHash(undefined);
      loadStatus();
    }
  }, [isConfirmed, loadStatus]);

  const handleGM = async () => {
    if (!address || !status.canGm || isSending || isConfirming) return;

    setError(null);
    try {
      const hash = await sendTransactionAsync({
        chainId: ARC_MAINNET_CHAIN_ID,
        to: GM_FEE_ADDRESS as `0x${string}`,
        value: parseEther('0.02'),
        data: GM_DATA as `0x${string}`,
      });
      setTxHash(hash);
    } catch (err: any) {
      const message = String(err?.shortMessage || err?.message || '').toLowerCase();
      setError(
        message.includes('user rejected') || message.includes('denied')
          ? 'GM cancelled in your wallet.'
          : 'GM transaction was not submitted. Check your Arc Mainnet balance and try again.'
      );
    }
  };

  const busy = isSending || isConfirming;

  return (
    <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="rounded-3xl border border-zinc-800 bg-[#0e1014] p-5 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-orange-300">
              <Flame className="w-3.5 h-3.5" />
              Daily GM
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">GM Streak</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Send one GM on Arc Mainnet every 24 hours. Each GM sends 0.02 USDC to the GM fee address in the same transaction, plus the normal Arc network fee.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Day N = N points
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Current streak</div>
            <div className="mt-2 text-2xl font-bold text-white">{status.streak}</div>
            <div className="text-xs text-zinc-500">days</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Points</div>
            <div className="mt-2 text-2xl font-bold text-white">{status.points}</div>
            <div className="text-xs text-zinc-500">current streak points</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Total GMs</div>
            <div className="mt-2 text-2xl font-bold text-white">{status.gmCount}</div>
            <div className="text-xs text-zinc-500">verified onchain</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Next GM</div>
            <div className="mt-2 text-2xl font-bold text-white">{loading ? '...' : countdown}</div>
            <div className="text-xs text-zinc-500">{status.canGm ? 'ready' : 'cooldown'}</div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-black/20 p-6 text-center">
          <button
            type="button"
            onClick={handleGM}
            disabled={!status.canGm || busy || loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            {isSending ? 'Confirm in wallet…' : isConfirming ? 'Confirming on Arc…' : status.canGm ? 'GM' : 'GM locked'}
          </button>
          <p className="mt-3 text-xs text-zinc-500">
            One GM per wallet every 24 hours · 0.02 USDC GM fee + Arc network fee
          </p>

          {txHash && (
            <a
              href={`${ARC_MAINNET_EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              View GM transaction <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {isConfirmed && (
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              GM confirmed on Arc Mainnet.
            </div>
          )}

          {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
          Streak scoring: day 1 = 1 point, day 2 = 2 points, day 3 = 3 points, continuing upward for each consecutive GM.
        </div>
      </div>
    </section>
  );
};
