'use client';

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return <div className="h-screen w-full bg-white flex items-center justify-center text-gray-500">Loading...</div>;
  }

  if (!session) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden text-gray-100">
      {/* Left Full Page Bar (Sidebar) */}
      <div className="w-64 h-full border-r border-[#1a1a1a] flex flex-col justify-between p-6 bg-[#0d0d0d]">
        <div>
          <div className="font-bold text-xl tracking-tight mb-10 text-white">
            Platform
          </div>
          <nav className="space-y-2">
            {/* Nav Items */}
            {['Home', 'Projects', 'Settings'].map((item) => (
              <div key={item} className="px-4 py-2.5 rounded-xl hover:bg-[#1a1a1a] cursor-pointer transition-colors text-sm font-medium text-gray-300 hover:text-white">
                {item}
              </div>
            ))}
          </nav>
        </div>
        
        {/* Bottom Profile Section */}
        <div className="mt-auto pt-6 border-t border-[#1a1a1a]">
          <div className="flex items-center gap-3 mb-4">
            {session.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-[#2a2a2a]" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white font-bold shadow-lg">
                {session.user?.name?.slice(0, 2).toUpperCase() || session.user?.email?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {session.user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session.user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full h-[40px] text-[13px] font-medium text-gray-400 hover:text-white hover:bg-[#1a1a1a] rounded-xl transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content (Dark Theme) */}
      <div className="flex-1 p-10 bg-[#0a0a0a] overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-[28px] font-semibold tracking-tight text-white mb-2">
            Welcome back{session.user?.name ? `, ${session.user.name}` : ''}
          </h1>
          <p className="text-gray-400 text-sm mb-8">
            This is your clean, dark workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
