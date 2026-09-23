import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { soundEngine } from '../../utils/sound';

export const SettingsView: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [isMuted, setIsMuted] = useState(soundEngine.getIsMuted());

  const handleThemeChange = (mode: 'light' | 'neon') => {
    soundEngine.playSoftClick(520, 0.05);
    setTheme(mode);
  };

  const toggleSound = () => setIsMuted(soundEngine.toggleMute());

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 animate-in fade-in duration-200">
      <div className="pb-2 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-white" />
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Settings</h1>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Appearance</h2>
            <p className="text-xs text-zinc-500 mt-1">{theme === 'light' ? 'Light' : 'Neon Core'}</p>
          </div>
          <button
            type="button"
            onClick={() => handleThemeChange(theme === 'light' ? 'neon' : 'light')}
            className="relative w-28 h-10 rounded-xl overflow-hidden border border-zinc-300 shadow-sm transition-all"
            aria-label={theme === 'light' ? 'Switch to Neon Core mode' : 'Switch to Light mode'}
          >
            <span className="absolute inset-y-0 left-0 w-1/2 bg-[#f5f5f5]" />
            <span className="absolute inset-y-0 right-0 w-1/2 bg-[#0D0D0D]" />
            <span
              className={`absolute top-1 w-8 h-8 rounded-lg bg-white shadow-md transition-all ${theme === 'light' ? 'left-1' : 'right-1'}`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] font-medium">
          <span className={theme === 'light' ? 'text-zinc-900 font-semibold' : 'text-zinc-500'}>Light</span>
          <span className={theme === 'neon' ? 'text-[#00FF85] font-semibold' : 'text-zinc-500'}>Neon Core</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0f12] border border-zinc-800 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-white" />}
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Sound</h2>
          </div>
          <button onClick={toggleSound} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${!isMuted ? 'bg-white text-black glow-blue-cta' : 'bg-[#131519] border border-zinc-800 text-zinc-400'}`}>
            {!isMuted ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0f12] border border-zinc-800 space-y-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-white" />
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight">Security & Privacy</h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          GEN-0FI never requests or stores private keys, seed phrases, or wallet passwords. Balances and transactions are verified against the public Arc blockchain.
        </p>
      </div>
    </div>
  );
};
