import React, { useState, useEffect } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { Sidebar, TabType } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { MobileNav } from './components/common/MobileNav';
import { LandingView } from './components/landing/LandingView';
import { OverviewView } from './components/dashboard/OverviewView';
import { ActivityView } from './components/activity/ActivityView';
import { AskGen0View } from './components/ask/AskGen0View';
import { SettingsView } from './components/settings/SettingsView';
import { ConnectWalletModal } from './components/wallet/ConnectWalletModal';
import { WrongNetworkView } from './components/wallet/WrongNetworkView';
import { WelcomeOnboarding } from './components/wallet/WelcomeOnboarding';
import { WalletIdentityModal } from './components/wallet/WalletIdentityModal';
import { initGlobalClickSound } from './utils/sound';

const AppContent: React.FC = () => {
  const {
    isConnected,
    address,
    isCorrectNetwork,
    showWelcomeOverlay,
    dismissWelcomeOverlay,
    connectWallet,
  } = useWallet();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  // Initialize soft click sound on all interactive elements
  useEffect(() => {
    const cleanup = initGlobalClickSound();
    return cleanup;
  }, []);

  const handleOpenConnect = () => {
    connectWallet().catch(() => {
      setIsConnectModalOpen(true);
    });
  };

  // If user is not connected, show the minimal, clear landing view
  if (!isConnected || !address) {
    return (
      <>
        <LandingView onOpenConnect={handleOpenConnect} />
        <ConnectWalletModal
          isOpen={isConnectModalOpen}
          onClose={() => setIsConnectModalOpen(false)}
        />
      </>
    );
  }

  // If wallet is connected to an unsupported network (e.g., Ethereum, Base, Arbitrum),
  // show dedicated WrongNetworkView instead of broken dashboard
  if (!isCorrectNetwork) {
    return <WrongNetworkView />;
  }

  // Connected SaaS Application Dashboard on Arc Testnet
  return (
    <div className="min-h-screen bg-[#090a0c] text-zinc-100 flex flex-col md:flex-row antialiased selection:bg-white selection:text-black">
      {/* First-time onboarding welcome state */}
      {showWelcomeOverlay && (
        <WelcomeOnboarding onDismiss={dismissWelcomeOverlay} />
      )}

      {/* Desktop Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenConnect={() => setIsIdentityModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 bg-[#0f1012]">
        <Header
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenConnect={() => setIsIdentityModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewView
              onSelectTab={setActiveTab}
              onOpenConnect={() => setIsIdentityModalOpen(true)}
            />
          )}

          {activeTab === 'activity' && <ActivityView />}

          {activeTab === 'ask' && <AskGen0View />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Connected Wallet Identity & Disconnect Modal */}
      <WalletIdentityModal
        isOpen={isIdentityModalOpen}
        onClose={() => setIsIdentityModalOpen(false)}
      />

      {/* Connect Wallet Fallback Modal */}
      <ConnectWalletModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
