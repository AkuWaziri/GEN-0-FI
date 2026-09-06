import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { OptionsController, AlertController } from '@reown/appkit-controllers';
import { mainnet, base, arbitrum, polygon, optimism } from 'viem/chains';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_EXPLORER_URL, ARC_TESTNET_RPC_URL } from './arc';

// Disable background third-party SDK analytics telemetry and origin allowlist checks for unused embedded wallets
if (typeof OptionsController !== 'undefined') {
  try {
    OptionsController.setEnableCoinbase(false);
    OptionsController.setEnableBaseAccount(false);
    OptionsController.setRemoteFeatures({
      email: false,
      socials: false,
    });
    OptionsController.subscribeKey('remoteFeatures', (val: any) => {
      if (val && (val.email || (Array.isArray(val.socials) && val.socials.length > 0))) {
        if (OptionsController.state.remoteFeatures) {
          OptionsController.state.remoteFeatures.email = false;
          OptionsController.state.remoteFeatures.socials = false;
        }
      }
    });
  } catch (_) {}
}

if (typeof AlertController !== 'undefined') {
  try {
    const origAlertOpen = AlertController.open?.bind(AlertController);
    if (origAlertOpen) {
      AlertController.open = (message: any, variant: any) => {
        const code = message?.code;
        if (code === 'APKT002' || code === 'APKT005') {
          return;
        }
        return origAlertOpen(message, variant);
      };
    }
  } catch (_) {}
}

// Arc Testnet as official AppKit / Wagmi network definition
export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  caipNetworkId: `eip155:${ARC_TESTNET_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_URL],
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: ARC_TESTNET_EXPLORER_URL,
    },
  },
  testnet: true,
});

// All supported networks in wagmi (Arc Testnet is primary; other chains are registered
// so when user connects on Base/Ethereum/etc., the app cleanly detects wrong network
// and facilitates one-click standard switching to Arc Testnet)
export const supportedNetworks = [arcTestnet, base, mainnet, arbitrum, polygon, optimism];

// Read Reown / WalletConnect Project ID with fallback for development and testing
export const WALLETCONNECT_PROJECT_ID =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID) ||
  'b56e18d47c72ab683b10814fe9495694'; // Reliable public project ID fallback if not set in .env

// Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  projectId: WALLETCONNECT_PROJECT_ID,
  networks: supportedNetworks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

// Initialize Reown AppKit modal once
export const appKitModal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [arcTestnet, base, mainnet, arbitrum, polygon, optimism],
  defaultNetwork: arcTestnet,
  projectId: WALLETCONNECT_PROJECT_ID,
  enableCoinbase: false,
  debug: false,
  metadata: {
    name: 'GEN-0 FI',
    description: 'Onchain financial intelligence, made simple.',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://gen0.fi',
    icons: ['https://testnet.arcscan.app/favicon.ico'],
  },
  features: {
    email: false, // Strictly no email per specifications
    socials: [], // Strictly no social logins per specifications
    emailShowWallets: false, // Disabled to prevent unnecessary embedded auth iframe initialization
    analytics: false,
    swaps: false,
    onramp: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#3b82f6',
    '--w3m-border-radius-master': '14px',
    '--w3m-font-family': 'Manrope, sans-serif',
    '--w3m-color-mix': '#000000',
    '--w3m-color-mix-strength': 40,
  },
});
