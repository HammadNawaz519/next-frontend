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
    <div className="flex h-screen bg-white overflow-hidden text-gray-900">
      {/* Left Full Page Bar (Sidebar) */}
      <div className="w-64 h-full border-r border-gray-200 flex flex-col justify-between p-6">
        <div>
          <div className="font-bold text-xl tracking-tight mb-10 text-gray-900">
            Platform
          </div>
          <nav className="space-y-2">
            {/* Nav Items */}
            {['Home', 'Projects', 'Settings'].map((item) => (
              <div key={item} className="px-4 py-2.5 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors text-sm font-medium text-gray-700">
                {item}
              </div>
            ))}
          </nav>
        </div>
        
        {/* Bottom Profile Section */}
        <div className="mt-auto pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            {session.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold">
                {session.user?.name?.slice(0, 2).toUpperCase() || session.user?.email?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {session.user?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session.user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full h-[40px] text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content (Completely White Page) */}
      <div className="flex-1 p-10 bg-white overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-[28px] font-semibold tracking-tight text-gray-900 mb-2">
            Welcome back{session.user?.name ? `, ${session.user.name}` : ''}
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            This is your clean, fully white workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
