import React from 'react';
import { Logo } from './Logo';
import { AddressBadge } from './AddressBadge';
import { TabType } from './Sidebar';
import { useWallet } from '../../context/WalletContext';
import { Wallet, Sun, Moon, Volume2, VolumeX, Menu } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { soundEngine } from '../../utils/sound';

interface HeaderProps { activeTab?: TabType; onSelectTab?: (tab: TabType) => void; onOpenConnect: () => void; onOpenMobileNav?: () => void; }

export const Header: React.FC<HeaderProps> = ({ activeTab, onSelectTab, onOpenConnect, onOpenMobileNav }) => {
  const { isConnected, address, shortAddress } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [isMuted, setIsMuted] = React.useState(soundEngine.getIsMuted());
  const toggleSound = () => setIsMuted(soundEngine.toggleMute());
  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Dashboard';
      case 'playmemes': return 'Playmemes';
      case 'activity': return 'Activity';
      case 'swap': return 'Swap & Bridge';
      case 'wallet': return 'Send & Receive';
      case 'savings': return 'Lend';
      case 'gm': return 'GM Streak';
      case 'addressbook': return 'Address Book';
      case 'points': return 'Leaderboard';
      case 'boundnft': return 'GEN-0 Bound NFT';
      default: return 'Dashboard';
    }
  };
  return (
    <header id="main-app-header" className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2.5 bg-[#000000]/90 backdrop-blur-md border-b border-zinc-900 select-none h-14 w-full">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          title="Open navigation"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-800 bg-[#0d0f12] text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="md:hidden flex items-center gap-2"><Logo size="sm" showText={true} /></div>
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs font-semibold text-white font-mono tracking-tight">{getTabTitle()}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to Neon Core mode' : 'Switch to Light mode'} title={theme === 'light' ? 'Neon Core' : 'Light'} className="flex items-center justify-center w-8 h-8 rounded-lg border border-zinc-800 bg-[#0d0f12] text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer">
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        {isConnected && address ? <div className="flex items-center"><AddressBadge address={address} shortAddress={shortAddress} onClick={onOpenConnect} /></div> :
          <button id="btn-header-connect" onClick={onOpenConnect} className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer whitespace-nowrap"><Wallet className="w-3.5 h-3.5" /><span>Connect</span></button>}
      </div>
      <button type="button" onClick={toggleSound} aria-label={isMuted ? 'Turn sound on' : 'Turn sound off'} title={isMuted ? 'Sound off' : 'Sound on'} className="fixed right-4 bottom-20 md:bottom-5 z-50 flex items-center justify-center w-9 h-9 rounded-full border border-zinc-800 bg-[#0d0f12]/95 backdrop-blur-md text-zinc-400 hover:text-white hover:border-zinc-700 shadow-lg transition-all cursor-pointer">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </header>
  );
};