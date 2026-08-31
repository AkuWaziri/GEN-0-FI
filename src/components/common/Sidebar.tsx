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
  const { isConnected, address, shortAddress, disconnectWallet, isDemoMode, exitDemoMode } = useWallet();

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

        {/* Demo Mode Indicator if active */}
        {isDemoMode && (
          <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                Demo Inspector
              </span>
              <button
                onClick={exitDemoMode}
                className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer font-mono"
              >
                Exit
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
              Inspecting Arc Testnet reference wallet.
            </p>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-link-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-zinc-800/90 text-white border border-zinc-700 font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-zinc-500'
                    }`}
                  />
                  <span className="tracking-tight">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-zinc-900 text-zinc-300 border border-zinc-700">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer: Connected Wallet Info */}
      <div className="pt-3 border-t border-zinc-900 space-y-2.5">
        {isConnected && address ? (
          <div className="p-2.5 rounded-xl bg-[#0e1014] border border-zinc-800">
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
            <AddressBadge address={address} shortAddress={shortAddress} />
          </div>
        ) : (
          <button
            id="btn-sidebar-connect-wallet"
            onClick={onOpenConnect}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-sm cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Connect Wallet</span>
          </button>
        )}

        <div className="text-center text-[10px] text-zinc-500 font-mono tracking-wider">
          GEN-0 FI • Arc Testnet
        </div>
      </div>
    </aside>
  );
};
