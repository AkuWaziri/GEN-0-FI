import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useDisconnect, useConnect } from 'wagmi';
import { useAppKit, useAppKitState } from '@reown/appkit/react';
import { ARC_TESTNET_CHAIN_ID } from '../config/arc';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'rejected' | 'failed';

export interface WalletConnectionHook {
  state: ConnectionState;
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connectorName: string | undefined;
  errorMessage: string | null;
  hasInjectedWallet: boolean;
  connectInjected: () => Promise<void>;
  openConnectModal: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  retry: () => Promise<void>;
}

export function useWalletConnection(): WalletConnectionHook {
  const { address, isConnected, isConnecting, isReconnecting, connector, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { connectors, connectAsync } = useConnect();
  const { open, close } = useAppKit();
  const { open: isModalOpen } = useAppKitState();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wasModalOpen = useRef<boolean>(false);
  const connectionAttemptActive = useRef<boolean>(false);

  const hasInjectedWallet = typeof window !== 'undefined' && Boolean((window as any).ethereum);

  // Compute derived connection state
  useEffect(() => {
    if (isConnected && address) {
      setConnectionState('connected');
      setErrorMessage(null);
      connectionAttemptActive.current = false;
    } else if (isConnecting || isReconnecting) {
      setConnectionState('connecting');
    } else if (errorMessage) {
      // Keep error or rejected state
    } else {
      setConnectionState('disconnected');
    }
  }, [isConnected, address, isConnecting, isReconnecting, errorMessage]);

  // Detect when user closes modal without connecting (cancellation / rejection)
  useEffect(() => {
    if (wasModalOpen.current && !isModalOpen && !isConnected && connectionAttemptActive.current) {
      // User closed modal without completing connection
      setConnectionState('rejected');
      setErrorMessage('Connection cancelled. You can try again whenever you are ready.');
      connectionAttemptActive.current = false;
    }
    wasModalOpen.current = isModalOpen;
  }, [isModalOpen, isConnected]);

  const connectInjected = useCallback(async () => {
    if (isConnecting || isReconnecting) return;

    setErrorMessage(null);
    setConnectionState('connecting');
    connectionAttemptActive.current = true;

    try {
      const injected = connectors.find((c) => c.id === 'injected' || c.type === 'injected') || connectors[0];
      if (!injected) {
        throw new Error('No browser wallet extension detected.');
      }
      await connectAsync({ connector: injected, chainId: ARC_TESTNET_CHAIN_ID });
      setConnectionState('connected');
    } catch (err: unknown) {
      console.warn('Direct injected connection attempt error:', err);
      const message = err instanceof Error ? err.message : "Couldn't connect browser wallet.";
      if (message.toLowerCase().includes('user rejected') || message.toLowerCase().includes('cancelled')) {
        setConnectionState('rejected');
        setErrorMessage('Connection cancelled in wallet extension');
      } else {
        setConnectionState('failed');
        setErrorMessage(message);
      }
    } finally {
      connectionAttemptActive.current = false;
    }
  }, [connectors, connectAsync, isConnecting, isReconnecting]);

  const openConnectModal = useCallback(async () => {
    // Prevent duplicate connection attempts
    if (isConnecting || isReconnecting) return;

    setErrorMessage(null);
    setConnectionState('connecting');
    connectionAttemptActive.current = true;

    try {
      await open({ view: 'Connect' });
    } catch (err: unknown) {
      console.error('Failed to open Reown AppKit connect modal:', err);
      const message = err instanceof Error ? err.message : "Couldn't open wallet connection modal.";
      if (message.toLowerCase().includes('user rejected') || message.toLowerCase().includes('cancelled')) {
        setConnectionState('rejected');
        setErrorMessage('Connection cancelled');
      } else {
        setConnectionState('failed');
        setErrorMessage("Couldn't connect your wallet. Please ensure your wallet extension or app is unlocked.");
      }
      connectionAttemptActive.current = false;
    }
  }, [isConnecting, isReconnecting, open]);

  const disconnect = useCallback(() => {
    try {
      wagmiDisconnect();
      close();
    } catch (err) {
      console.warn('Disconnect exception:', err);
    }
    setConnectionState('disconnected');
    setErrorMessage(null);
    connectionAttemptActive.current = false;
  }, [wagmiDisconnect, close]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setConnectionState(isConnected ? 'connected' : 'disconnected');
  }, [isConnected]);

  const retry = useCallback(async () => {
    clearError();
    await openConnectModal();
  }, [clearError, openConnectModal]);

  return {
    state: connectionState,
    address,
    isConnected: Boolean(isConnected && address),
    isConnecting: Boolean(isConnecting || isReconnecting || connectionState === 'connecting'),
    connectorName: connector?.name,
    errorMessage,
    hasInjectedWallet,
    connectInjected,
    openConnectModal,
    disconnect,
    clearError,
    retry,
  };
}
