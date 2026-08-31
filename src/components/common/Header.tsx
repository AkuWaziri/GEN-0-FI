import React, { useState } from 'react';
import { Logo } from './Logo';
import { NetworkBadge } from './NetworkBadge';
import { AddressBadge } from './AddressBadge';
import { TabType } from './Sidebar';
import { useWallet } from '../../context/WalletContext';
import { RefreshCw, Wallet, Settings, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../../utils/sound';

interface HeaderProps {
  activeTab?: TabType;
  onSelectTab?: (tab: TabType) => void;
  onOpenConnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onSelectTab, onOpenConnect }) => {
  const { isConnected, address, shortAddress, isRefreshing, refreshData, isDemoMode } = useWallet();
  const [isMuted, setIsMuted] = useState(soundEngine.getIsMuted());

  const toggleSound = () => {
    const nextMuted = soundEngine.toggleMute();
    setIsMuted(nextMuted);
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview':
        return 'Overview';
      case 'activity':
        return 'Activity';
      case 'ask':
        return 'Ask GEN-0';
      case 'settings':
        return 'Settings';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2.5 bg-[#000000]/90 backdrop-blur-md border-b border-zinc-900 select-none h-14 w-full"
    >
      {/* Left side: on mobile shows logo, on desktop shows active tab title & demo badge */}
      <div className="flex items-center gap-3">
        <div className="md:hidden flex items-center gap-2">
          <Logo size="sm" showText={true} />
        </div>

        <div className="hidden md:flex items-center gap-2.5">
          <span className="text-xs font-semibold text-white font-mono tracking-tight">
            {getTabTitle()}
          </span>
          {isDemoMode && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-mono tracking-wider font-semibold">
              DEMO INSPECTOR
            </span>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <div className="hidden sm:block">
          <NetworkBadge compact={true} />
        </div>

        {/* Audio feedback mute toggle */}
        <button
          id="btn-header-sound-toggle"
          onClick={toggleSound}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            !isMuted
              ? 'bg-[#111317] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'
              : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
          title={isMuted ? 'Unmute UI sounds' : 'Mute UI sounds'}
          aria-label={isMuted ? 'Unmute UI sounds' : 'Mute UI sounds'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {isConnected && (
          <button
            id="btn-header-refresh"
            onClick={() => refreshData()}
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg bg-[#111317] border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer ${
              isRefreshing ? 'opacity-70' : ''
            }`}
            title="Refresh blockchain data"
            aria-label="Refresh blockchain data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
          </button>
        )}

        {/* Mobile / Quick Settings Icon */}
        {onSelectTab && (
          <button
            id="btn-header-settings"
            onClick={() => onSelectTab('settings')}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-[#111317] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'
            }`}
            title="Settings & Network"
            aria-label="Open Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        {isConnected && address ? (
          <div className="flex items-center">
            <AddressBadge address={address} shortAddress={shortAddress} />
          </div>
        ) : (
          <button
            id="btn-header-connect"
            onClick={onOpenConnect}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Connect</span>
          </button>
        )}
      </div>
    </header>
  );
};
