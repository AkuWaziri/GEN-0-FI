import React from 'react';
import { TabType } from './Sidebar';
import { LayoutDashboard, History, Sparkles, Settings } from 'lucide-react';

interface MobileNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'activity' as TabType, label: 'Activity', icon: History },
    { id: 'ask' as TabType, label: 'Ask', icon: Sparkles },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      id="mobile-bottom-nav"
      role="tablist"
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#08090b]/95 backdrop-blur-lg border-t border-zinc-900 px-3 py-1.5 flex items-center justify-around select-none shadow-lg pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
    >
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
            className={`relative flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 ease-out cursor-pointer min-w-[60px] select-none ${
              isActive
                ? 'text-white font-semibold bg-blue-500/[0.08] border border-blue-500/25 shadow-[0_0_14px_rgba(59,130,246,0.14)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent font-medium'
            }`}
          >
            <Icon
              className={`w-4 h-4 transition-colors duration-200 ${
                isActive
                  ? 'text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.35)]'
                  : 'text-zinc-500'
              }`}
            />
            <span className="text-[10px] tracking-tight">{item.label}</span>

            {/* Thin blue indicator beneath active tab */}
            {isActive && (
              <span
                className="absolute bottom-0.5 left-2.5 right-2.5 h-[2px] bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)]"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};
