'use client';

import React, { useState, useEffect } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Lock,
  Eye,
  EyeOff,
  ChevronLeft,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { DeviceAccountStore, DeviceAccountMeta } from '@/lib/deviceAccountStore';
import { triggerHaptic } from '@/lib/haptics';

export default function AccountsPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [savedAccounts, setSavedAccounts] = useState<DeviceAccountMeta[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'remove'>('list');

  // Password Prompt for switching account
  const [selectedAccount, setSelectedAccount] = useState<DeviceAccountMeta | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState('');

  // Load accounts on mount
  const loadAccounts = async () => {
    const accounts = await DeviceAccountStore.getSavedAccounts();
    setSavedAccounts(accounts);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // One-Tap or Password Account Switch
  const handleSelectAccount = async (acc: DeviceAccountMeta) => {
    triggerHaptic('medium');
    const currentEmail = session?.user?.email?.toLowerCase().trim();
    if (acc.email.toLowerCase().trim() === currentEmail) {
      router.push('/dashboard');
      return;
    }

    // Show password prompt to authenticate
    setSelectedAccount(acc);
    setPasswordPrompt('');
    setPromptError('');
  };

  const handlePasswordPromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || !passwordPrompt) return;
    triggerHaptic('medium');
    setPromptLoading(true);
    setPromptError('');

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: selectedAccount.email,
        password: passwordPrompt,
      });

      if (res?.ok) {
        DeviceAccountStore.setCurrentAccountId(selectedAccount.userId);
        router.push('/dashboard');
      } else {
        setPromptError('Invalid password. Please try again.');
        setPromptLoading(false);
      }
    } catch (err) {
      setPromptError('Connection error. Please try again.');
      setPromptLoading(false);
    }
  };

  const handleRemoveAccount = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    await DeviceAccountStore.removeAccount(userId);
    loadAccounts();
  };

  const curEmail = session?.user?.email?.toLowerCase().trim();

  return (
    <div className="fixed inset-0 h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none">
      
      {/* ── 1. TOP DARK REGION: HEADER ── */}
      <div className="w-full bg-[#141111] pt-14 pb-8 px-6 flex flex-col items-center relative select-none shrink-0">
        <div className="w-full flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-1.5 -ml-1.5 text-white hover:text-zinc-300 active:scale-95 transition-all cursor-pointer outline-none bg-transparent"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
          </button>

          <h1 className="text-[20px] font-black text-white tracking-tight">
            Accounts
          </h1>

          <button
            onClick={() => {
              triggerHaptic('light');
              setViewMode(viewMode === 'list' ? 'remove' : 'list');
            }}
            className="text-[13px] font-bold text-[#D8B4E2] hover:text-white transition-all cursor-pointer p-1"
          >
            {viewMode === 'list' ? 'Manage' : 'Done'}
          </button>
        </div>

        <p className="text-[13px] text-zinc-400 text-center font-normal">
          Switch between your accounts or add a new one
        </p>
      </div>

      {/* ── 2. BOTTOM WHITE SHEET: SAVED ACCOUNTS LIST ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] px-6 pt-5 pb-8 flex flex-col relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-4 shrink-0" />

        <div className="w-full max-w-[440px] mx-auto flex flex-col gap-3">
          
          {/* List of Saved Accounts */}
          {savedAccounts.map((acc) => {
            const isCurrent = acc.email.toLowerCase().trim() === curEmail;
            return (
              <div
                key={acc.userId}
                onClick={() => viewMode === 'list' && handleSelectAccount(acc)}
                className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                  isCurrent
                    ? 'bg-zinc-50 border-zinc-300 shadow-2xs'
                    : 'bg-white border-zinc-100 hover:bg-zinc-50/80 cursor-pointer shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-xs">
                    {acc.profilePicture ? (
                      <img src={acc.profilePicture} alt={acc.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(acc.displayName || acc.username || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-zinc-900 truncate">
                        {acc.displayName || acc.username}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-zinc-500 truncate font-normal">
                      {acc.email}
                    </span>
                  </div>
                </div>

                {/* Right Action */}
                {viewMode === 'remove' ? (
                  <button
                    onClick={(e) => handleRemoveAccount(acc.userId, e)}
                    className="px-4 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[12px] font-bold border border-zinc-300 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 shadow-2xs"
                    title="Delete Account"
                  >
                    Delete
                  </button>
                ) : (
                  <div className="text-zinc-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Another Account Button - redirects directly to login / signup screen */}
          <button
            onClick={async () => {
              triggerHaptic('light');
              if (session?.user) {
                await signOut({ redirect: false });
              }
              router.push('/');
            }}
            className="w-full h-14 rounded-full border-2 border-dashed border-zinc-200 hover:border-zinc-400 text-zinc-700 font-bold text-[14px] flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99] mt-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Another Account</span>
          </button>
        </div>
      </div>

      {/* ── MODAL A: PASSWORD PROMPT FOR SWITCHING ACCOUNT ── */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-0 md:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-[440px] bg-white rounded-t-[32px] md:rounded-[32px] p-6 flex flex-col gap-4 shadow-2xl animate-in slide-in-from-bottom-6">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-2 mb-1 shrink-0" />
            
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center text-white font-bold text-base shrink-0">
                {selectedAccount.profilePicture ? (
                  <img src={selectedAccount.profilePicture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{(selectedAccount.displayName || 'U').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-[16px] font-bold text-zinc-900 truncate">
                  Sign in to {selectedAccount.displayName || selectedAccount.username}
                </h3>
                <span className="text-[12px] text-zinc-500 truncate">{selectedAccount.email}</span>
              </div>
            </div>

            {promptError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{promptError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordPromptSubmit} className="flex flex-col gap-3.5 mt-1">
              <div className="w-full h-14 bg-zinc-50 border border-zinc-200 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 transition-all">
                <Lock className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type={showPasswordPrompt ? 'text' : 'password'}
                  value={passwordPrompt}
                  onChange={(e) => setPasswordPrompt(e.target.value)}
                  placeholder="Enter account password"
                  required
                  autoFocus
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordPrompt(!showPasswordPrompt)}
                  className="text-zinc-400 hover:text-zinc-600 p-1 outline-none"
                >
                  {showPasswordPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAccount(null)}
                  className="flex-1 h-13 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-[14px] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={promptLoading}
                  className="flex-1 h-13 rounded-full bg-[#141111] hover:bg-black text-white font-bold text-[14px] shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {promptLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
