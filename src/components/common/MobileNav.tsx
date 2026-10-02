import React from 'react';
import { TabType } from './Sidebar';
import { LayoutDashboard, History, ArrowLeftRight, Trophy, Flame, Send, PiggyBank, BookUser, Sparkles, Zap, X } from 'lucide-react';

interface MobileNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab, isOpen, onToggle }) => {
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

  const selectTab = (tab: TabType) => {
    onSelectTab(tab);
    onToggle();
  };

  return (
    <>
      {isOpen && (
        <button type="button" aria-label="Close navigation overlay" onClick={onToggle} className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]" />
      )}

      <aside
        id="mobile-sidebar"
        aria-label="Main Navigation"
        className={`md:hidden fixed left-0 top-0 bottom-0 z-50 w-[280px] border-r border-zinc-900 bg-[#08090b] p-4 pt-5 shadow-2xl transition-transform duration-200 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-2 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Navigation</span>
          <button type="button" onClick={onToggle} aria-label="Close navigation" className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="space-y-1.5" role="tablist">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-nav-${item.id}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(item.id)}
                className={`relative w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all duration-200 cursor-pointer select-none text-left ${isActive ? 'bg-blue-500/[0.09] text-white border border-blue-400/20 font-semibold glow-blue-tab' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent font-medium'}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
