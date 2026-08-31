import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#131519] border border-zinc-800/80 ${className}`}
    />
  );
};
