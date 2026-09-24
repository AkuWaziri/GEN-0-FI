import React from 'react';
import { TabType } from './Sidebar';
import { LayoutDashboard, History, Settings, ArrowLeftRight, Trophy, Send, Sparkles, Coins, PiggyBank } from 'lucide-react';

interface MobileNavProps { activeTab: TabType; onSelectTab: (tab: TabType) => void; }

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: 'overview' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'swap' as TabType, label: 'Swap', icon: ArrowLeftRight },
    { id: 'wallet' as TabType, label: 'Wallet', icon: Send },
    { id: 'savings' as TabType, label: 'Savings', icon: PiggyBank },
    { id: 'fx' as TabType, label: 'FX', icon: Coins },
    { id: 'copilot' as TabType, label: 'COPILOT', icon: Sparkles },
    { id: 'points' as TabType, label: 'Leaderboard', icon: Trophy },
    { id: 'activity' as TabType, label: 'Activity', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];
  return (
    <nav id="mobile-bottom-nav" role="tablist" aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#08090b]/95 backdrop-blur-lg border-t border-zinc-900 px-1 py-1.5 flex items-center overflow-x-auto select-none shadow-lg pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      {navItems.map((item) => {
        const Icon = item.icon; const isActive = activeTab === item.id;
        return <button key={item.id} id={`mobile-nav-${item.id}`} role="tab" aria-selected={isActive} onClick={() => onSelectTab(item.id)}
          className={`relative flex flex-col items-center justify-center gap-1 py-1 px-2 rounded-xl transition-all duration-200 ease-out cursor-pointer min-w-[76px] flex-none select-none ${isActive ? 'text-white font-semibold bg-blue-500/[0.09] border glow-blue-tab' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent font-medium'}`}>
          <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} /><span className="text-[9px] tracking-tight whitespace-nowrap">{item.label}</span>
        </button>;
      })}
    </nav>
  );
};