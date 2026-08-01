'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Trash2, UserPlus, LogIn, Lock, Eye, EyeOff, X, ArrowLeft, ChevronRight } from 'lucide-react';
import { GrainGradient } from '@paper-design/shaders-react';
import { useTheme } from '@/app/components/ThemeProvider';

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
  const [viewMode, setViewMode] = useState<'list' | 'remove'>('list');
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Password modal state
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hydration safety and loading from device-local storage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('connected_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out any locally removed emails
          const removedStr = localStorage.getItem('removed_accounts');
          const removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
          const cleanAccounts = parsed.filter(
            (acc: SavedAccount) => acc?.email && !removedList.includes(acc.email.toLowerCase().trim())
          );
          setAccounts(cleanAccounts);
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

  // Remove account permanently from device cache/memory
  const handleRemoveAccount = (email: string) => {
    try {
      const targetEmail = email.toLowerCase().trim();
      const updated = accounts.filter(acc => acc.email.toLowerCase().trim() !== targetEmail);
      setAccounts(updated);

      if (updated.length > 0) {
        localStorage.setItem('connected_accounts', JSON.stringify(updated));
      } else {
        localStorage.removeItem('connected_accounts');
      }

      // Add to device removed_accounts blacklist so it never reappears on refresh
      const removedStr = localStorage.getItem('removed_accounts');
      let removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
      if (!Array.isArray(removedList)) removedList = [];
      if (!removedList.includes(targetEmail)) {
        removedList.push(targetEmail);
        localStorage.setItem('removed_accounts', JSON.stringify(removedList));
      }

      // If no accounts remain, exit remove view
      if (updated.length === 0) {
        setViewMode('list');
      }
    } catch (e) {
      console.error('Failed to remove account:', e);
    }
  };

  const handleAccountClick = async (acc: SavedAccount) => {
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
      <div className="w-full h-full flex flex-col p-6 md:p-10 pt-[calc(1.25rem+0.15in+env(safe-area-inset-top,0px))] md:pt-12 justify-between relative overflow-hidden">
        
        {/* ── HEADER (Shifted ~0.15in down to avoid touching nav/status bar) ── */}
        <div className="flex items-center justify-between mb-6 relative z-20 pt-2">
          {viewMode === 'remove' ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode('list')}
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer ${
                  isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white' : 'bg-gray-100 border-gray-200 text-gray-700 hover:text-gray-950'
                }`}
                title="Back to Account Center"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-950'}`}>Remove Accounts</h1>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Remove saved logins from this device</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-950'}`}>Account Center</h1>
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Manage saved accounts on this device</p>
              </div>
            </div>
          )}

          {/* 3-Dots Dropdown Menu (Top Right) */}
          {viewMode === 'list' && accounts.length > 0 && (
            <div className="relative z-[100]" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300' 
                    : 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-700'
                }`}
                title="Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* High Z-Index Smooth Animated Dropdown Panel */}
              {showDropdown && (
                <div 
                  className={`absolute right-0 mt-2 w-52 border rounded-2xl p-1.5 shadow-2xl z-[100] transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200 ${
                    isDark 
                      ? 'bg-[#16161a]/95 border-zinc-800 text-white backdrop-blur-xl' 
                      : 'bg-white/95 border-gray-200 text-gray-900 backdrop-blur-xl shadow-xl'
                  }`}
                >
                  <p className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                    Account Options
                  </p>
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setViewMode('remove');
                    }}
                    className={`w-full text-left px-3.5 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2.5 cursor-pointer ${
                      isDark 
                        ? 'hover:bg-rose-500/10 text-rose-400/90 hover:text-rose-300' 
                        : 'hover:bg-rose-50 text-rose-600/90'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 text-rose-400/80" />
                    Remove an account
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── VIEW 1: NORMAL SAVED ACCOUNTS LIST ── */}
        {viewMode === 'list' && (
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-6 relative z-10 min-h-[180px] flex flex-col justify-start">
              {accounts.length === 0 ? (
                <div className="text-center py-10 my-auto">
                  <div className={`w-14 h-14 rounded-full border flex items-center justify-center mx-auto mb-4 ${
                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-200'
                  }`}>
                    <Lock className={`w-6 h-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
                  </div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>No saved accounts on this device</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Sign in below to save your profile to Account Center</p>
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
                      className={`group flex items-center justify-between p-4 rounded-[1.75rem] border backdrop-blur-xl transition-all duration-300 ${
                        isDark
                          ? 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 shadow-[0_4px_25px_rgba(0,0,0,0.3)] cursor-pointer active:scale-[0.98]'
                          : 'border-gray-200/80 bg-white/80 hover:bg-white hover:border-gray-300 shadow-[0_4px_20px_rgba(0,0,0,0.03)] cursor-pointer active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {acc.image ? (
                          <img
                            src={acc.image}
                            alt={accountName}
                            className={`w-12 h-12 rounded-full border object-cover flex-shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                              isDark ? 'border-zinc-700' : 'border-gray-200'
                            }`}
                          />
                        ) : (
                          <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase transition-transform duration-300 group-hover:scale-105 ${
                            isDark 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300' 
                              : 'bg-gray-100 border-gray-200 text-gray-700'
                          }`}>
                            {getInitials(acc)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className={`text-sm font-bold truncate transition-colors ${
                            isDark ? 'text-zinc-100 group-hover:text-white' : 'text-gray-900 group-hover:text-gray-950'
                          }`}>
                            {accountName}
                          </p>
                          <p className={`text-xs truncate mt-0.5 font-medium ${
                            isDark ? 'text-zinc-400' : 'text-gray-500'
                          }`}>{displayUsername}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                        <ChevronRight className={`w-4 h-4 transition-colors ${isDark ? 'text-zinc-600 group-hover:text-zinc-400' : 'text-gray-400 group-hover:text-gray-600'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className={`space-y-3 pt-4 border-t z-10 ${isDark ? 'border-zinc-900' : 'border-gray-200'}`}>
              <button
                onClick={() => router.push('/?sheet=signUp')}
                className={`w-full flex items-center justify-center gap-2 transition-all active:scale-98 rounded-full py-3.5 font-semibold text-sm shadow-md cursor-pointer ${
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
                className={`w-full flex items-center justify-center gap-2 border rounded-full py-3.5 font-semibold text-sm transition-all active:scale-98 cursor-pointer ${
                  isDark 
                    ? 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 hover:text-white border-zinc-800' 
                    : 'bg-white hover:bg-gray-50 text-gray-750 hover:text-gray-950 border-gray-200'
                }`}
              >
                <LogIn className="w-4 h-4" />
                Sign In to Existing Account
              </button>
            </div>
          </>
        )}

        {/* ── VIEW 2: DEDICATED REMOVE ACCOUNTS VIEW PAGE ── */}
        {viewMode === 'remove' && (
          <div className="flex-1 flex flex-col justify-between relative z-10 animate-in fade-in slide-in-from-right-4 duration-250">
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 mb-6">
              {accounts.length === 0 ? (
                <div className="text-center py-10 my-auto">
                  <p className={`text-sm font-semibold ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>All accounts removed</p>
                </div>
              ) : (
                accounts.map((acc) => {
                  const accountName = acc.name || acc.username || acc.email.split('@')[0];
                  const rawUsername = acc.username || acc.email.split('@')[0];
                  const displayUsername = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;

                  return (
                    <div
                      key={acc.email}
                      className={`flex items-center justify-between p-4 rounded-[1.75rem] border transition-all ${
                        isDark 
                          ? 'border-zinc-800/80 bg-zinc-900/40 shadow-[0_4px_25px_rgba(0,0,0,0.3)]' 
                          : 'border-gray-200/80 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {acc.image ? (
                          <img
                            src={acc.image}
                            alt={accountName}
                            className={`w-12 h-12 rounded-full border object-cover flex-shrink-0 ${
                              isDark ? 'border-zinc-700' : 'border-gray-200'
                            }`}
                          />
                        ) : (
                          <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold text-sm flex-shrink-0 uppercase ${
                            isDark 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300' 
                              : 'bg-gray-100 border-gray-200 text-gray-700'
                          }`}>
                            {getInitials(acc)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className={`text-sm font-bold truncate ${
                            isDark ? 'text-zinc-100' : 'text-gray-900'
                          }`}>
                            {accountName}
                          </p>
                          <p className={`text-xs truncate mt-0.5 font-medium ${
                            isDark ? 'text-zinc-400' : 'text-gray-500'
                          }`}>{displayUsername}</p>
                        </div>
                      </div>

                      {/* Right "Remove" button with subtle, natural rose styling */}
                      <button
                        onClick={() => handleRemoveAccount(acc.email)}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-500/90 dark:text-rose-400/90 dark:bg-rose-500/15 border border-rose-500/20 dark:border-rose-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                        title="Remove from device"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400/80" />
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setViewMode('list')}
              className={`w-full py-3.5 rounded-full text-sm font-semibold border transition-all active:scale-98 cursor-pointer ${
                isDark 
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white' 
                  : 'bg-gray-100 border-gray-200 text-gray-700 hover:text-gray-950'
              }`}
            >
              Done
            </button>
          </div>
        )}
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
          <div className="absolute inset-0" onClick={() => !loading && setSelectedAccount(null)} />
          
          <div className={`relative w-full max-w-md border-t sm:border rounded-t-[2.5rem] sm:rounded-[2rem] p-8 pb-12 sm:pb-8 shadow-2xl z-10 transform animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ${
            isDark ? 'bg-[#121214] border-zinc-800/80' : 'bg-white border-gray-200'
          }`}>
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
                isDark ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-rose-600 bg-rose-50 border-rose-200'
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
