import React, { useState, useEffect } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar, TabType } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { MobileNav } from './components/common/MobileNav';
import { LandingView } from './components/landing/LandingView';
import { OverviewView } from './components/dashboard/OverviewView';
import { ActivityView } from './components/activity/ActivityView';
import { AskGen0View } from './components/ask/AskGen0View';
import { GMStreakView } from './components/gm/GMStreakView';
import { SettingsView } from './components/settings/SettingsView';
import { ConnectWalletModal } from './components/wallet/ConnectWalletModal';
import { WrongNetworkView } from './components/wallet/WrongNetworkView';
import { WelcomeOnboarding } from './components/wallet/WelcomeOnboarding';
import { WalletIdentityModal } from './components/wallet/WalletIdentityModal';
import { Footer } from './components/common/Footer';
import { initGlobalClickSound } from './utils/sound';

const AppContent: React.FC = () => {
  const { isConnected, address, isCorrectNetwork, showWelcomeOverlay, dismissWelcomeOverlay, connectWallet } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  useEffect(() => {
    const cleanup = initGlobalClickSound();
    return cleanup;
  }, []);

  const handleOpenConnect = () => {
    connectWallet().catch(() => setIsConnectModalOpen(true));
  };

  if (!isConnected || !address) {
    return (
      <>
        <LandingView onOpenConnect={handleOpenConnect} />
        <ConnectWalletModal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} />
      </>
    );
  }

  if (!isCorrectNetwork) return <WrongNetworkView />;

  return (
    <div className="min-h-screen bg-[#090a0c] text-zinc-100 flex flex-col md:flex-row antialiased selection:bg-white selection:text-black">
      {showWelcomeOverlay && <WelcomeOnboarding onDismiss={dismissWelcomeOverlay} />}
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} onOpenConnect={() => setIsIdentityModalOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 bg-[#0f1012]">
        <Header activeTab={activeTab} onSelectTab={setActiveTab} onOpenConnect={() => setIsIdentityModalOpen(true)} />
        <main className="flex-1 overflow-y-auto flex flex-col justify-between">
          <div>
            {activeTab === 'overview' && <OverviewView onSelectTab={setActiveTab} onOpenConnect={() => setIsIdentityModalOpen(true)} />}
            {activeTab === 'ask' && <AskGen0View />}
            {activeTab === 'gm' && <GMStreakView />}
            {activeTab === 'activity' && <ActivityView />}
            {activeTab === 'settings' && <SettingsView />}
          </div>
          {activeTab !== 'ask' && <Footer />}
        </main>
      </div>
      <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />
      <WalletIdentityModal isOpen={isIdentityModalOpen} onClose={() => setIsIdentityModalOpen(false)} />
      <ConnectWalletModal isOpen={isConnectModalOpen} onClose={() => setIsConnectModalOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </ThemeProvider>
  );
};
