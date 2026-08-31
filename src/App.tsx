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
import { initGlobalClickSound } from './utils/sound';

const AppContent: React.FC = () => {
  const { isConnected, address } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  // Initialize soft click sound on all interactive elements
  useEffect(() => {
    const cleanup = initGlobalClickSound();
    return cleanup;
  }, []);

  // If user is not connected and hasn't selected a demo address, show the landing page
  if (!isConnected || !address) {
    return (
      <>
        <LandingView onOpenConnect={() => setIsConnectModalOpen(true)} />
        <ConnectWalletModal
          isOpen={isConnectModalOpen}
          onClose={() => setIsConnectModalOpen(false)}
        />
      </>
    );
  }

  // Connected SaaS Application Dashboard
  return (
    <div className="min-h-screen bg-[#090a0c] text-zinc-100 flex flex-col md:flex-row antialiased selection:bg-white selection:text-black">
      {/* Desktop Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenConnect={() => setIsConnectModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 bg-[#0f1012]">
        <Header
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenConnect={() => setIsConnectModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <OverviewView
              onSelectTab={setActiveTab}
              onOpenConnect={() => setIsConnectModalOpen(true)}
            />
          )}

          {activeTab === 'activity' && <ActivityView />}

          {activeTab === 'ask' && <AskGen0View />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Connect / Address Inspector Modal */}
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
