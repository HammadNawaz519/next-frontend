'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Trash2, Plus, UserPlus, LogIn, Lock, Eye, EyeOff, X, ArrowLeft } from 'lucide-react';

interface SavedAccount {
  email: string;
  username?: string;
  name?: string;
  image?: string;
  provider?: string;
}

export default function AccountsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [removeMode, setRemoveMode] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Password modal state
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hydration safety and loading from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('connected_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setAccounts(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  }, []);

  // Dropdown close listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const handleRemoveAccount = (email: string) => {
    try {
      const updated = accounts.filter(acc => acc.email !== email);
      setAccounts(updated);
      localStorage.setItem('connected_accounts', JSON.stringify(updated));
      
      // If we ran out of accounts, exit remove mode
      if (updated.length === 0) {
        setRemoveMode(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAccountClick = async (acc: SavedAccount) => {
    if (removeMode) return;
    
    if (acc.provider === 'google') {
      setLoading(true);
      setError('');
      try {
        await signIn('google', { callbackUrl: '/dashboard' });
      } catch (err) {
        setError('Failed to log in with Google.');
        setLoading(false);
      }
    } else {
      setSelectedAccount(acc);
      setPassword('');
      setError('');
      setShowPassword(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    setLoading(true);
    setError('');

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: selectedAccount.email,
        password: password,
      });

      if (res?.error === 'EMAIL_NOT_VERIFIED') {
        setError("This account is not verified. Please log in on the main page to verify.");
      } else if (res?.error) {
        setError('Incorrect password.');
      } else {
        // Success
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (acc: SavedAccount) => {
    if (acc.username) return acc.username.slice(0, 2).toUpperCase();
    if (acc.name) return acc.name.slice(0, 2).toUpperCase();
    return acc.email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden select-none font-sans">
      {/* Decorative Blur Spheres */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] aspect-square rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] aspect-square rounded-full bg-amber-600/10 blur-[120px] pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative w-full max-w-md bg-zinc-950/40 border border-zinc-800/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-white tracking-wider text-sm">
              C
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Account Center</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Switch accounts instantly</p>
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-850 transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-zinc-400" />
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-[#121214] border border-zinc-800 rounded-2xl py-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <button
                    onClick={() => {
                      setRemoveMode(!removeMode);
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-900 text-zinc-200 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    {removeMode ? 'Exit Remove Mode' : 'Remove an account'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Remove mode active banner */}
        {removeMode && (
          <div className="flex items-center justify-between bg-red-950/30 border border-red-900/30 rounded-2xl px-4 py-3 mb-6 animate-in slide-in-from-top duration-300">
            <span className="text-xs text-red-400 font-medium">Remove Mode Active</span>
            <button
              onClick={() => setRemoveMode(false)}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Saved Accounts List */}
        <div className="space-y-3.5 mb-8 min-h-[160px] flex flex-col justify-center">
          {accounts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400 font-medium">No saved accounts found</p>
              <p className="text-xs text-zinc-600 mt-1">Sign in below to save your credentials</p>
            </div>
          ) : (
            accounts.map((acc) => (
              <div
                key={acc.email}
                onClick={() => handleAccountClick(acc)}
                className={`group flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 ${
                  removeMode
                    ? 'border-red-900/10 bg-red-950/5 cursor-default'
                    : 'border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/70 hover:border-zinc-700/60 cursor-pointer active:scale-[0.99]'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {acc.image ? (
                    <img
                      src={acc.image}
                      alt={acc.name || acc.username}
                      className="w-11 h-11 rounded-full border border-zinc-800 object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 text-sm flex-shrink-0 uppercase">
                      {getInitials(acc)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                      {acc.name || acc.username || acc.email.split('@')[0]}
                    </p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{acc.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                  {acc.provider === 'google' && !removeMode && (
                    <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">
                      Google
                    </span>
                  )}
                  {removeMode ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveAccount(acc.email);
                      }}
                      className="p-2 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all active:scale-95"
                      title="Remove from Account Center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Options */}
        <div className="space-y-3 pt-6 border-t border-zinc-900">
          <button
            onClick={() => router.push('/?sheet=signUp')}
            className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3 font-semibold text-sm shadow-md"
          >
            <UserPlus className="w-4 h-4" />
            Create an Account
          </button>
          
          <button
            onClick={() => router.push('/?sheet=signIn')}
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 rounded-full py-3 font-semibold text-sm transition-all active:scale-98"
          >
            <LogIn className="w-4 h-4" />
            Sign In to Existing Account
          </button>
        </div>
      </div>

      {/* ── PASSWORD DIALOG MODAL ── */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          {/* Backdrop overlay listener to close */}
          <div className="absolute inset-0" onClick={() => !loading && setSelectedAccount(null)} />
          
          <div className="relative w-full max-w-md bg-[#121214] border-t sm:border border-zinc-800/80 rounded-t-[2.5rem] sm:rounded-[2rem] p-8 pb-12 sm:pb-8 shadow-2xl z-10 transform animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
            {/* Grab Bar for mobile feel */}
            <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-6 sm:hidden" />
            
            <button
              disabled={loading}
              onClick={() => setSelectedAccount(null)}
              className="absolute top-6 right-6 p-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 overflow-hidden">
                {selectedAccount.image ? (
                  <img src={selectedAccount.image} alt={selectedAccount.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-xl uppercase text-zinc-300">{getInitials(selectedAccount)}</span>
                )}
              </div>
              <h2 className="text-lg font-bold text-white">Enter Password</h2>
              <p className="text-xs text-zinc-500 mt-1">Sign in as {selectedAccount.name || selectedAccount.username || selectedAccount.email}</p>
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3.5 mb-4 animate-in shake duration-300">
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="space-y-1 relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={loading}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm pr-12"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
