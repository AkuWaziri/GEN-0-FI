import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { OptionsController, AlertController } from '@reown/appkit-controllers';
import { mainnet, base, arbitrum, polygon, optimism } from 'viem/chains';
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URL,
  ARC_CHAIN_ID,
  ARC_RPC_URL,
  ARC_EXPLORER_URL,
  ARC_FALLBACK_RPC_URL,
} from './arc';

// Deployment trigger: keep Arc Mainnet RPC fallback changes flowing to Vercel.

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

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  caipNetworkId: `eip155:${ARC_MAINNET_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: 'Arc',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_MAINNET_RPC_URL, ARC_FALLBACK_RPC_URL],
    },
    public: {
      http: [ARC_MAINNET_RPC_URL, ARC_FALLBACK_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: ARC_MAINNET_EXPLORER_URL,
    },
  },
  testnet: false,
});

export const arcTestnet = arcMainnet;

export const supportedNetworks = [arcMainnet, base, mainnet, arbitrum, polygon, optimism];

export const WALLETCONNECT_PROJECT_ID =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID) ||
  'b56e18d47c72ab683b10814fe9495694';

export const wagmiAdapter = new WagmiAdapter({
  projectId: WALLETCONNECT_PROJECT_ID,
  networks: supportedNetworks,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const appKitModal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [arcMainnet, base, mainnet, arbitrum, polygon, optimism],
  defaultNetwork: arcMainnet,
  projectId: WALLETCONNECT_PROJECT_ID,
  enableCoinbase: false,
  debug: false,
  metadata: {
    name: 'GEN-0 FI',
    description: 'Onchain financial intelligence, made simple.',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://gen0.fi',
    icons: ['https://arc.etherscan.io/favicon.ico'],
  },
  features: {
    email: false,
    socials: [],
    emailShowWallets: false,
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
