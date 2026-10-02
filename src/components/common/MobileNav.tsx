import React from 'react';
import { TabType } from './Sidebar';
import { LayoutDashboard, History, ArrowLeftRight, Trophy, Flame, Send, PiggyBank, BookUser, Sparkles, Zap } from 'lucide-react';

interface MobileNavProps { activeTab: TabType; onSelectTab: (tab: TabType) => void; }

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: 'overview' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'gm' as TabType, label: 'GM Streak', icon: Flame },
    { id: 'gateway' as TabType, label: 'Circle Gateway', icon: Zap },
    { id: 'swap' as TabType, label: 'Swap & Bridge', icon: ArrowLeftRight },
    { id: 'wallet' as TabType, label: 'Send & Receive', icon: Send },
    { id: 'savings' as TabType, label: 'Lend', icon: PiggyBank },
    { id: 'addressbook' as TabType, label: 'Address Book', icon: BookUser },
    { id: 'boundnft' as TabType, label: 'GEN-0 Bound NFT', icon: Sparkles },
    { id: 'points' as TabType, label: 'Leaderboard', icon: Trophy },
    { id: 'activity' as TabType, label: 'Activity', icon: History },
  ];

  return (
    <nav
      id="mobile-tab-nav"
      role="tablist"
      aria-label="Main Navigation"
      className="md:hidden sticky top-14 z-20 w-full border-b border-zinc-900 bg-[#08090b]/95 backdrop-blur-lg select-none"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(item.id)}
              className={`relative shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-all duration-200 ease-out cursor-pointer select-none whitespace-nowrap ${
                isActive
                  ? 'bg-blue-500/[0.09] text-white border border-blue-400/20 font-semibold glow-blue-tab'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent font-medium'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
