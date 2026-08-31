import React from 'react';
import { TabType } from './Sidebar';
import { LayoutDashboard, History, Sparkles } from 'lucide-react';

interface MobileNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'activity' as TabType, label: 'Activity', icon: History },
    { id: 'ask' as TabType, label: 'Ask', icon: Sparkles },
  ];

  return (
    <nav
      id="mobile-bottom-nav"
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#08090b]/95 backdrop-blur-lg border-t border-zinc-900 px-4 py-1.5 flex items-center justify-around select-none shadow-lg pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            id={`mobile-nav-${item.id}`}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-4 rounded-xl transition-all cursor-pointer min-w-[64px] ${
              isActive
                ? 'text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500'}`} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
