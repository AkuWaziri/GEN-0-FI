import React from 'react';
import { Logo } from './Logo';
import { AddressBadge } from './AddressBadge';
import { TabType } from './Sidebar';
import { useWallet } from '../../context/WalletContext';
import { Wallet } from 'lucide-react';

interface HeaderProps { activeTab?: TabType; onSelectTab?: (tab: TabType) => void; onOpenConnect: () => void; }

export const Header: React.FC<HeaderProps> = ({ activeTab, onSelectTab, onOpenConnect }) => {
  const { isConnected, address, shortAddress } = useWallet();
  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Dashboard';
      case 'activity': return 'Activity';
      case 'ask': return 'Ask GEN-0';
      case 'swap': return 'Swap & Bridge';
      case 'gm': return 'GM Streak';
      case 'settings': return 'Settings';
      default: return 'Dashboard';
    }
  };
  return (
    <header id="main-app-header" className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2.5 bg-[#000000]/90 backdrop-blur-md border-b border-zinc-900 select-none h-14 w-full">
      <div className="flex items-center gap-3">
        <div className="md:hidden flex items-center gap-2"><Logo size="sm" showText={true} /></div>
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs font-semibold text-white font-mono tracking-tight">{getTabTitle()}</span>
          <nav aria-label="Desktop navigation" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectTab?.('gm')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${activeTab === 'gm' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              aria-current={activeTab === 'gm' ? 'page' : undefined}
            >
              GM Streak
            </button>
          </nav>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-2.5">
        {isConnected && address ? <div className="flex items-center"><AddressBadge address={address} shortAddress={shortAddress} onClick={onOpenConnect} /></div> :
          <button id="btn-header-connect" onClick={onOpenConnect} className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer whitespace-nowrap"><Wallet className="w-3.5 h-3.5" /><span>Connect</span></button>}
      </div>
    </header>
  );
};
