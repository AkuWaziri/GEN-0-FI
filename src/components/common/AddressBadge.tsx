import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { getArcScanAddressUrl } from '../../config/arc';

interface AddressBadgeProps {
  address: string;
  shortAddress?: string;
  showExplorer?: boolean;
  className?: string;
  onClick?: () => void;
}

export const AddressBadge: React.FC<AddressBadgeProps> = ({
  address,
  shortAddress,
  showExplorer = true,
  className = '',
  onClick,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const display = shortAddress || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '');

  return (
    <div
      id={`address-badge-${address.slice(-4)}`}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#111317] border border-zinc-800 text-xs text-zinc-200 font-mono ${
        onClick ? 'cursor-pointer hover:border-zinc-600 hover:bg-[#16181f] transition-all' : ''
      } ${className}`}
      title={onClick ? 'Click to view wallet details' : address}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span className="font-medium text-white">{display}</span>

      <div className="flex items-center gap-1 border-l border-zinc-800 pl-1.5 ml-0.5">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          title={copied ? 'Copied to clipboard' : 'Copy address'}
          aria-label="Copy wallet address"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
        </button>

        {showExplorer && (
          <a
            href={getArcScanAddressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="View on ArcScan Explorer"
            aria-label="Open in ArcScan Explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};
