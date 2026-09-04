import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useAppKit, useAppKitState } from '@reown/appkit/react';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'rejected' | 'failed';

export interface WalletConnectionHook {
  state: ConnectionState;
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connectorName: string | undefined;
  errorMessage: string | null;
  openConnectModal: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  retry: () => Promise<void>;
}

export function useWalletConnection(): WalletConnectionHook {
  const { address, isConnected, isConnecting, isReconnecting, connector, status } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { open, close } = useAppKit();
  const { open: isModalOpen } = useAppKitState();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const wasModalOpen = useRef<boolean>(false);
  const connectionAttemptActive = useRef<boolean>(false);

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
    openConnectModal,
    disconnect,
    clearError,
    retry,
  };
}
