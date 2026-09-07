import React from 'react';
import { ARC_NETWORK_CONFIG } from '../../config/arc';
import { ExternalLink } from 'lucide-react';

export const Footer: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <footer
      id="gen0-app-footer"
      className={`border-t border-zinc-900/90 py-5 px-4 sm:px-8 lg:px-12 w-full bg-[#000000]/60 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono select-none ${className}`}
    >
      {/* Left side: Copyright & Network */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-zinc-400">
        <span className="font-semibold text-zinc-200 tracking-tight">© 2026 GEN-0 FI</span>
        <span className="text-zinc-600 hidden xs:inline">•</span>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#111317] border border-zinc-800 text-[11px] text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
          <span>Arc. Testnet</span>
        </div>
      </div>

      {/* Right side: Explorer + Social Links (X & Telegram) */}
      <div className="flex items-center gap-4 text-zinc-400">
        <a
          id="footer-link-arcscan"
          href={ARC_NETWORK_CONFIG.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors flex items-center gap-1 text-[11px] hover:underline"
          title="Open ArcScan Block Explorer"
        >
          <span>ArcScan</span>
          <ExternalLink className="w-3 h-3 text-zinc-500" />
        </a>

        <div className="w-px h-3.5 bg-zinc-800" />

        {/* Social Icons */}
        <div className="flex items-center gap-2">
          {/* X (Twitter) link */}
          <a
            id="footer-social-x"
            href="https://x.com/Gen_0Fi"
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 rounded-lg bg-[#111317] hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/40 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-none hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]"
            title="Follow GEN-0 FI on X (@Gen_0Fi)"
            aria-label="GEN-0 FI on X"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Telegram link */}
          <a
            id="footer-social-telegram"
            href="https://t.me/Gen_0Fi"
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 rounded-lg bg-[#111317] hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/40 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-none hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]"
            title="Join GEN-0 FI on Telegram"
            aria-label="GEN-0 FI on Telegram"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
};
