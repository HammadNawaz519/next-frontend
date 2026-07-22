'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Trash2, Plus, UserPlus, LogIn, Lock, Eye, EyeOff, X, ArrowLeft, ChevronRight } from 'lucide-react';
import { GrainGradient } from '@paper-design/shaders-react';
import { useTheme } from '@/app/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';

interface SavedAccount {
  email: string;
  username?: string;
  name?: string;
  image?: string;
  provider?: string;
}

export default function AccountsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
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
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${
        isDark ? 'bg-[#050505]' : 'bg-[#f3f4f6]'
      }`}>
        <div className={`w-8 h-8 border-2 rounded-full animate-spin ${
          isDark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'
        }`} />
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
    if (removeMode) {
      handleRemoveAccount(acc.email);
      return;
    }
    
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

  const renderLeft = () => {
    return (
      <div className="relative overflow-hidden hidden lg:flex flex-col items-center justify-center h-full">
        <GrainGradient
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          colorBack={isDark ? "#0A0A0C" : "#F8F9FA"}
          softness={0.5}
          intensity={0.8}
          noise={0.06}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={0.8}
          rotation={0}
          speed={0.5}
          colors={['#8B5CF6', '#3B82F6', '#F59E0B']}
        />
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-12 text-center select-none">
          <p
            className="font-light lg:tracking-[0.4em] uppercase text-sm lg:[writing-mode:vertical-rl] lg:rotate-180"
            style={{ 
              letterSpacing: '0.45em', 
              opacity: 0.75,
              color: isDark ? '#ffffff' : '#111827'
            }}
          >
            Account Center
          </p>
        </div>
      </div>
    );
  };

  const renderAccountCenterContent = () => {
    return (
      <div className="w-full h-full flex flex-col p-8 md:p-10 justify-between relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div>
              <h1 className={`text-xl font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-950'}`}>Account Center</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            
            {accounts.length > 0 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850' 
                      : 'bg-gray-100 border-gray-200 hover:bg-gray-150'
                  }`}
                >
                  <MoreVertical className={`w-5 h-5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`} />
                </button>

                {showDropdown && (
                  <div className={`absolute right-0 mt-2 w-48 border rounded-2xl py-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
                    isDark ? 'bg-[#121214] border-zinc-800' : 'bg-white border-gray-200'
                  }`}>
                    <button
                      onClick={() => {
                        setRemoveMode(!removeMode);
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 cursor-pointer ${
                        isDark 
                          ? 'hover:bg-zinc-900 text-zinc-200 hover:text-white' 
                          : 'hover:bg-gray-100 text-gray-750 hover:text-gray-950'
                      }`}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                      {removeMode ? 'Exit Remove Mode' : 'Remove an account'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Remove mode active banner */}
        {removeMode && (
          <div className={`flex items-center justify-between border rounded-2xl px-4 py-2.5 mb-4 animate-in slide-in-from-top duration-300 z-10 ${
            isDark 
              ? 'bg-red-950/20 border-red-900/30' 
              : 'bg-red-50 border-red-200'
          }`}>
            <span className="text-xs text-red-400 font-medium">Remove Mode Active</span>
            <button
              onClick={() => setRemoveMode(false)}
              className="text-xs text-zinc-400 hover:text-zinc-650 dark:hover:text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Saved Accounts List */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-4 relative z-10 min-h-[160px] flex flex-col justify-start">
          {accounts.length === 0 ? (
            <div className="text-center py-8 my-auto">
              <div className={`w-12 h-12 rounded-full border flex items-center justify-center mx-auto mb-4 ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'
              }`}>
                <Lock className={`w-5 h-5 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
              </div>
              <p className={`text-sm font-medium ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>No saved accounts found</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>Sign in below to save your credentials</p>
            </div>
          ) : (
            accounts.map((acc) => {
              const accountName = acc.name || acc.username || acc.email.split('@')[0];
              const rawUsername = acc.username || acc.email.split('@')[0];
              const displayUsername = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;

              return (
                <div
                  key={acc.email}
                  onClick={() => handleAccountClick(acc)}
                  className={`group flex items-center justify-between p-4 rounded-2xl border backdrop-blur-xl transition-all duration-300 ${
                    removeMode
                      ? isDark 
                        ? 'border-red-500/30 bg-red-900/10 cursor-default' 
                        : 'border-red-300 bg-red-50/60 cursor-default'
                      : isDark
                        ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer active:scale-[0.98]'
                        : 'border-black/5 bg-white/60 hover:bg-white/80 hover:border-black/10 shadow-sm cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {acc.image ? (
                      <img
                        src={acc.image}
                        alt={accountName}
                        className={`w-11 h-11 rounded-full border object-cover flex-shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                          isDark ? 'border-zinc-800' : 'border-gray-200'
                        }`}
                      />
                    ) : (
                      <div className={`w-11 h-11 rounded-full border flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase transition-transform duration-300 group-hover:scale-105 ${
                        isDark 
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-300' 
                          : 'bg-gray-100 border-gray-200 text-gray-700'
                      }`}>
                        {getInitials(acc)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate transition-colors ${
                        isDark ? 'text-zinc-200 group-hover:text-white' : 'text-gray-900 group-hover:text-gray-950'
                      }`}>
                        {accountName}
                      </p>
                      <p className={`text-xs truncate mt-0.5 font-medium ${
                        isDark ? 'text-zinc-500' : 'text-gray-500'
                      }`}>{displayUsername}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                    {removeMode ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAccount(acc.email);
                        }}
                        className="p-2 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all active:scale-95 cursor-pointer"
                        title="Remove from Account Center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <ChevronRight className={`w-4 h-4 transition-colors ${isDark ? 'text-zinc-600 group-hover:text-zinc-400' : 'text-gray-400 group-hover:text-gray-600'}`} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Remove Account Action Button (placed below accounts list) */}
        {accounts.length > 0 && (
          <div className="mb-4 z-10">
            <button
              onClick={() => setRemoveMode(!removeMode)}
              className={`w-full flex items-center justify-center gap-2 border rounded-xl py-2.5 px-4 text-xs font-semibold transition-all active:scale-98 cursor-pointer ${
                removeMode
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  : isDark
                    ? 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    : 'bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-950 hover:bg-gray-200'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              {removeMode ? 'Done Removing Accounts' : 'Remove an Account'}
            </button>
          </div>
        )}

        {/* Bottom Options */}
        <div className={`space-y-3 pt-4 border-t z-10 ${isDark ? 'border-zinc-900' : 'border-gray-200'}`}>
          <button
            onClick={() => router.push('/?sheet=signUp')}
            className={`w-full flex items-center justify-center gap-2 transition-all active:scale-98 rounded-full py-3 font-semibold text-sm shadow-md cursor-pointer ${
              isDark 
                ? 'bg-white text-black hover:bg-zinc-200' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Create an Account
          </button>
          
          <button
            onClick={() => router.push('/?sheet=signIn')}
            className={`w-full flex items-center justify-center gap-2 border rounded-full py-3 font-semibold text-sm transition-all active:scale-98 cursor-pointer ${
              isDark 
                ? 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 hover:text-white border-zinc-800' 
                : 'bg-white hover:bg-gray-50 text-gray-750 hover:text-gray-950 border-gray-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Sign In to Existing Account
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-[100dvh] w-full flex flex-col justify-center items-center relative overflow-hidden select-none font-sans transition-colors duration-500 ${
      isDark ? 'bg-[#050505] text-white' : 'bg-[#f3f4f6] text-gray-900'
    }`}>
      {/* Decorative Blur Spheres */}
      <div className={`absolute top-[-20%] left-[-10%] w-[60%] aspect-square rounded-full blur-[120px] pointer-events-none transition-colors duration-1000 ${
        isDark ? 'bg-violet-600/10' : 'bg-violet-400/10'
      }`} />
      <div className={`absolute bottom-[-20%] right-[-10%] w-[60%] aspect-square rounded-full blur-[120px] pointer-events-none transition-colors duration-1000 ${
        isDark ? 'bg-amber-600/10' : 'bg-amber-400/10'
      }`} />

      {/* Desktop split card view */}
      <div className="hidden lg:grid lg:grid-cols-2 w-full h-full relative z-10 transition-all duration-500 overflow-hidden"
        style={{ 
          backgroundColor: isDark ? 'transparent' : 'transparent'
        }}
      >
        {renderLeft()}
        <div className={`h-full overflow-hidden flex flex-col ${isDark ? 'bg-[#0E0E11]' : 'bg-white'}`}>
          {renderAccountCenterContent()}
        </div>
      </div>

      {/* Mobile view layout */}
      <div className={`lg:hidden relative w-full h-full flex flex-col overflow-hidden z-10 transition-colors duration-500 ${
        isDark ? 'bg-[#0E0E11]' : 'bg-white'
      }`}>
        {renderAccountCenterContent()}
      </div>

      {/* ── PASSWORD DIALOG MODAL ── */}
      {selectedAccount && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          {/* Backdrop overlay listener to close */}
          <div className="absolute inset-0" onClick={() => !loading && setSelectedAccount(null)} />
          
          <div className={`relative w-full max-w-md border-t sm:border rounded-t-[2.5rem] sm:rounded-[2rem] p-8 pb-12 sm:pb-8 shadow-2xl z-10 transform animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ${
            isDark ? 'bg-[#121214] border-zinc-800/80' : 'bg-white border-gray-200'
          }`}>
            {/* Grab Bar for mobile feel */}
            <div className={`w-12 h-1 rounded-full mx-auto mb-6 sm:hidden ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`} />
            
            <button
              disabled={loading}
              onClick={() => setSelectedAccount(null)}
              className={`absolute top-6 right-6 p-1.5 rounded-full border transition-colors disabled:opacity-50 cursor-pointer ${
                isDark 
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800' 
                  : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-950 hover:bg-gray-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-4 overflow-hidden ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-150 border-gray-200'
              }`}>
                {selectedAccount.image ? (
                  <img src={selectedAccount.image} alt={selectedAccount.username} className="w-full h-full object-cover" />
                ) : (
                  <span className={`font-bold text-xl uppercase ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>{getInitials(selectedAccount)}</span>
                )}
              </div>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-950'}`}>Enter Password</h2>
              <p className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Sign in as {selectedAccount.name || selectedAccount.username || selectedAccount.email}</p>
            </div>

            {error && (
              <div className={`text-xs border rounded-2xl px-4 py-3.5 mb-4 animate-in shake duration-300 ${
                isDark ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-red-600 bg-red-50 border-red-200'
              }`}>
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
                  className={`w-full rounded-full border px-5 py-3 focus:outline-none transition-colors text-sm pr-12 ${
                    isDark 
                      ? 'bg-[#1c1c1e] text-white placeholder:text-zinc-500 border-zinc-800 focus:border-zinc-500' 
                      : 'bg-gray-50 text-gray-900 placeholder:text-gray-400 border-gray-200 focus:border-gray-400'
                  }`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className={`w-full transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                  isDark ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                {loading ? (
                  <div className={`w-4 h-4 border-2 rounded-full animate-spin ${
                    isDark ? 'border-black/20 border-t-black' : 'border-white/20 border-t-white'
                  }`} />
                ) : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
