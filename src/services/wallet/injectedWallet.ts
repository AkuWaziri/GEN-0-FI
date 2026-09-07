import { ARC_NETWORK_CONFIG, ARC_TESTNET_CHAIN_ID } from '../../config/arc';

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  walletName: string | null;
  error: string | null;
}

export type WalletListener = (state: WalletState) => void;

class InjectedWalletManager {
  private listeners: Set<WalletListener> = new Set();
  private state: WalletState = {
    isConnected: false,
    address: null,
    chainId: null,
    isCorrectNetwork: false,
    isConnecting: false,
    walletName: null,
    error: null,
  };

  constructor() {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      this.bindEvents();
    }
  }

  public getState(): WalletState {
    return { ...this.state };
  }

  public subscribe(listener: WalletListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  private detectWalletName(): string {
    if (typeof window === 'undefined') return 'Browser Wallet';
    const eth = (window as any).ethereum;
    if (!eth) return 'Browser Wallet';
    if (eth.isRabby) return 'Rabby';
    if (eth.isMetaMask) return 'MetaMask';
    if (eth.isCoinbaseWallet) return 'Coinbase Wallet';
    if (eth.isBraveWallet) return 'Brave Wallet';
    return 'Injected EVM Wallet';
  }

  private bindEvents() {
    const eth = (window as any).ethereum;
    if (!eth || !eth.on) return;

    eth.on('accountsChanged', (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        this.state = {
          ...this.state,
          isConnected: false,
          address: null,
          error: null,
        };
      } else {
        this.state = {
          ...this.state,
          isConnected: true,
          address: accounts[0],
          error: null,
        };
      }
      this.notify();
    });

    eth.on('chainChanged', (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      this.state = {
        ...this.state,
        chainId,
        isCorrectNetwork: chainId === ARC_TESTNET_CHAIN_ID,
      };
      this.notify();
    });
  }

  public async connect(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const eth = (window as any).ethereum;
    if (!eth) {
      this.state.error = 'No EVM browser wallet detected. Install MetaMask, Rabby, or open in a Web3 browser.';
      this.notify();
      return false;
    }

    this.state.isConnecting = true;
    this.state.error = null;
    this.notify();

    try {
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const chainIdHex: string = await eth.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      const walletName = this.detectWalletName();

      this.state = {
        isConnected: accounts.length > 0,
        address: accounts[0] || null,
        chainId,
        isCorrectNetwork: chainId === ARC_TESTNET_CHAIN_ID,
        isConnecting: false,
        walletName,
        error: null,
      };
      this.notify();
      return true;
    } catch (err: any) {
      console.error('Wallet connection failed:', err);
      this.state.isConnecting = false;
      this.state.error = err.message || 'User rejected the connection request.';
      this.notify();
      return false;
    }
  }

  public async switchToArcTestnet(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const eth = (window as any).ethereum;
    if (!eth) return false;

    const arcChainIdHex = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;

    try {
      // Try switching first
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: arcChainIdHex }],
      });
      this.state.chainId = ARC_TESTNET_CHAIN_ID;
      this.state.isCorrectNetwork = true;
      this.notify();
      return true;
    } catch (switchError: any) {
      // Error 4902 indicates the chain has not been added to MetaMask/wallet
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902 || switchError.message?.includes('unrecognized')) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: arcChainIdHex,
                chainName: ARC_NETWORK_CONFIG.name,
                nativeCurrency: ARC_NETWORK_CONFIG.nativeCurrency,
                rpcUrls: [ARC_NETWORK_CONFIG.rpcUrl],
                blockExplorerUrls: [ARC_NETWORK_CONFIG.explorerUrl],
              },
            ],
          });
          this.state.chainId = ARC_TESTNET_CHAIN_ID;
          this.state.isCorrectNetwork = true;
          this.notify();
          return true;
        } catch (addError: any) {
          console.error('Failed to add Arc to wallet:', addError);
          this.state.error = addError.message || 'Failed to add Arc network.';
          this.notify();
          return false;
        }
      }
      console.error('Failed to switch to Arc:', switchError);
      this.state.error = switchError.message || 'Failed to switch network.';
      this.notify();
      return false;
    }
  }

  public disconnect() {
    this.state = {
      isConnected: false,
      address: null,
      chainId: null,
      isCorrectNetwork: false,
      isConnecting: false,
      walletName: null,
      error: null,
    };
    this.notify();
  }
}

export const injectedWallet = new InjectedWalletManager();
