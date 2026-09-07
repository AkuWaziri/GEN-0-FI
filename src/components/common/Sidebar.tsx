import React from 'react';
import { Logo } from './Logo';
import { NetworkBadge } from './NetworkBadge';
import { AddressBadge } from './AddressBadge';
import { useWallet } from '../../context/WalletContext';
import { LayoutDashboard, History, Sparkles, Settings, LogOut, Wallet } from 'lucide-react';

export type TabType = 'overview' | 'activity' | 'ask' | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenConnect: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, onOpenConnect }) => {
  const { isConnected, address, shortAddress, disconnectWallet } = useWallet();

  const navItems = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'activity' as TabType, label: 'Activity', icon: History },
    { id: 'ask' as TabType, label: 'Ask GEN-0', icon: Sparkles, badge: 'AI' },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      id="desktop-sidebar"
      className="hidden md:flex flex-col w-60 shrink-0 bg-[#08090b] border-r border-zinc-900 min-h-screen p-4 justify-between select-none"
    >
      <div className="space-y-4">
        {/* Brand Logo */}
        <div className="px-2 pt-1 pb-0.5">
          <Logo size="md" />
        </div>

        {/* Network Status Pill */}
        <div className="px-1">
          <NetworkBadge />
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5" aria-label="Main Navigation" role="tablist">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-link-${item.id}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectTab(item.id)}
                className={`relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all duration-200 ease-out cursor-pointer select-none group ${
                  isActive
                    ? 'bg-blue-500/[0.09] text-white border font-semibold glow-blue-tab'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent font-medium hover:border-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                      isActive
                        ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.45)]'
                        : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  <span className="tracking-tight">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold transition-colors duration-200 ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-700/80 group-hover:text-zinc-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {/* Thin blue indicator beneath active tab */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-[2px] bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer: Connected Wallet Info */}
      <div className="pt-3 border-t border-zinc-900 space-y-2.5">
        {isConnected && address ? (
          <div className="p-2.5 rounded-xl bg-[#0e1014] border border-zinc-800/90 hover:border-blue-500/30 hover:shadow-[0_0_18px_-3px_rgba(59,130,246,0.18)] transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">
                Your Wallet
              </span>
              <button
                onClick={disconnectWallet}
                className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800 cursor-pointer"
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
            <AddressBadge
              address={address}
              shortAddress={shortAddress}
              onClick={onOpenConnect}
            />
          </div>
        ) : (
          <button
            id="btn-sidebar-connect-wallet"
            onClick={onOpenConnect}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Connect Wallet</span>
          </button>
        )}
      </div>
    </aside>
  );
};
