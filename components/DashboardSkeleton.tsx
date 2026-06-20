'use client';

import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div className="flex h-[100dvh] overflow-hidden font-sans font-light bg-zinc-50 dark:bg-[#0e0e11] text-zinc-900 dark:text-zinc-100">
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="relative w-full h-full flex flex-col min-h-0 overflow-hidden">
          
          {/* Blobs background mockup */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[80px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[80px] rounded-full" />
          </div>

          <div className="relative z-10 px-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
            <div className="flex items-center justify-between px-4 py-2.5 rounded-full bg-white/40 dark:bg-black/20 border border-white/40 dark:border-white/10 backdrop-blur-xl">
              <div className="w-20 h-4 bg-zinc-400/20 dark:bg-zinc-600/20 animate-pulse rounded" />
              <div className="w-8 h-8 bg-zinc-400/20 dark:bg-zinc-600/20 animate-pulse rounded-full" />
            </div>
          </div>
          
          <div className="relative z-10 px-5 pt-4">
            <div className="flex flex-col items-center gap-3 w-full py-10 rounded-[2rem] bg-white/40 dark:bg-black/20 border border-white/40 dark:border-white/10 backdrop-blur-xl shadow-sm">
              <div className="w-48 h-8 bg-zinc-400/20 dark:bg-zinc-600/20 animate-pulse rounded-lg" />
              <div className="w-24 h-5 bg-zinc-400/20 dark:bg-zinc-600/20 animate-pulse rounded-lg mt-1" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Nav Skeleton */}
      <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-black/40 border border-white/50 dark:border-white/10 backdrop-blur-xl shadow-lg z-50">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center justify-center w-10 h-10">
            <div className="w-6 h-6 rounded-full bg-zinc-400/20 dark:bg-zinc-600/20 animate-pulse" />
          </div>
        ))}
      </nav>
    </div>
  );
}
