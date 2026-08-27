'use client';

import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden font-sans bg-[#141111] text-zinc-100 select-none">
      <div className="flex-1 flex flex-col h-full w-full relative overflow-hidden">
        {/* 1. Dark Header (Top Section ~35%) */}
        <div className="w-full bg-[#141111] pt-[calc(3rem+env(safe-area-inset-top,0px))] px-6 pb-6 flex flex-col justify-between flex-shrink-0">
          <div className="flex justify-between items-center w-full">
            <div className="flex flex-col gap-1.5">
              <div className="w-24 h-3.5 bg-zinc-800/80 rounded-full animate-pulse" />
              <h1 className="text-[26px] font-extrabold text-white tracking-tight leading-none">
                Connect
              </h1>
            </div>

            {/* Notification Bell & Add Story Placeholders */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800/80 animate-pulse" />
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800/80 animate-pulse" />
            </div>
          </div>
        </div>

        {/* 2. Light Bottom Sheet (Bottom Section) */}
        <div className="w-full flex-1 bg-white rounded-t-[32px] px-6 pt-3 pb-28 flex flex-col relative shadow-[0_-12px_30px_rgba(0,0,0,0.15)] overflow-hidden min-h-0">
          {/* Sheet Drag Handle */}
          <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto my-1 flex-shrink-0" />

          {/* Sub-Header Row */}
          <div className="flex justify-between items-center mt-4 mb-3 flex-shrink-0">
            <div className="w-32 h-6 bg-zinc-200 rounded-lg animate-pulse" />
            <div className="w-24 h-7 bg-zinc-100 rounded-full animate-pulse" />
          </div>

          {/* Quick Search Skeleton */}
          <div className="pt-1 pb-3 flex-shrink-0">
            <div className="w-full h-10 rounded-2xl bg-zinc-100/90 border border-zinc-200/70 animate-pulse" />
          </div>

          {/* Chat List Skeletons */}
          <div className="flex flex-col gap-3.5 overflow-hidden flex-1 pt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3.5 p-2 rounded-2xl animate-pulse">
                {/* Avatar Shimmer */}
                <div className="w-14 h-14 rounded-full bg-zinc-200 flex-shrink-0" />
                {/* User info Shimmer */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-28 h-4 bg-zinc-200 rounded" />
                    <div className="w-10 h-3 bg-zinc-200 rounded" />
                  </div>
                  <div className="w-40 h-3 bg-zinc-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Skeleton */}
      <nav className="mobile-nav pointer-events-none">
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-1">
          <div className="w-5 h-5 rounded-full bg-zinc-700/60 animate-pulse" />
          <span className="text-[10px] text-zinc-500 font-medium">Messages</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-1">
          <div className="w-5 h-5 rounded-full bg-zinc-700/60 animate-pulse" />
          <span className="text-[10px] text-zinc-500 font-medium">Calls</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-1">
          <div className="w-5 h-5 rounded-full bg-zinc-700/60 animate-pulse" />
          <span className="text-[10px] text-zinc-500 font-medium">Profile</span>
        </div>
      </nav>
    </div>
  );
}
