'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Trash2, UserPlus, LogIn, Lock, Eye, EyeOff, X, ArrowLeft,
  ChevronRight, Check, Key, Shield, UserCheck
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/app/components/ThemeProvider';

const GrainGradient = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
  { ssr: false }
);

interface SavedAccount {
  email: string;
  username?: string;
  name?: string;
  image?: string;
  provider?: string;
  password?: string;
  isCurrent?: boolean;
}

export default function AccountsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'remove'>('list');
  const [showDropdown, setShowDropdown] = useState(false);

  // Password Modal for accounts without saved credentials
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hydration safety and loading from device storage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('connected_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const removedStr = localStorage.getItem('removed_accounts');
          const removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
          const cleanAccounts = parsed.filter(
            (acc: SavedAccount) => acc && acc.email && typeof acc.email === 'string' && !removedList.includes(acc.email.toLowerCase().trim())
          );
          setAccounts(cleanAccounts);
        }
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  }, []);

  const curEmail = session?.user?.email ? session.user.email.toLowerCase().trim() : '';

  // Construct displayAccounts merging active session at top
  const displayAccounts = React.useMemo(() => {
    const map = new Map<string, SavedAccount>();
    if (session?.user?.email) {
      const email = session.user.email.toLowerCase().trim();
      const username = (session.user as any).username || email.split('@')[0];
      map.set(email, {
        email,
        username,
        name: session.user.name || 'User',
        image: session.user.image || '',
        isCurrent: true
      });
    }
    accounts.forEach((acc) => {
      if (!acc || !acc.email) return;
      const key = acc.email.toLowerCase().trim();
      const isCurrent = key === curEmail;
      if (!map.has(key)) {
        map.set(key, { ...acc, isCurrent });
      } else {
        map.set(key, { ...map.get(key), ...acc, isCurrent: true });
      }
    });
    return Array.from(map.values());
  }, [session, accounts, curEmail]);

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
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505]' : 'bg-[#f3f4f6]'}`}>
        <div className={`w-8 h-8 border-2 rounded-full animate-spin ${isDark ? 'border-white/20 border-t-white' : 'border-black/20 border-t-black'}`} />
      </div>
    );
  }

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

      const removedStr = localStorage.getItem('removed_accounts');
      let removedList: string[] = removedStr ? JSON.parse(removedStr) : [];
      if (!Array.isArray(removedList)) removedList = [];
      if (!removedList.includes(targetEmail)) {
        removedList.push(targetEmail);
        localStorage.setItem('removed_accounts', JSON.stringify(removedList));
      }
      if (updated.length === 0) setViewMode('list');
    } catch (e) {
      console.error(e);
    }
  };

  const handleAccountClick = async (acc: SavedAccount) => {
    if (acc.isCurrent) return;

    // 1. If account has saved password info on this device -> 1-tap direct login without prompting!
    if (acc.password) {
      setSwitchingEmail(acc.email);
      setError('');
      try {
        const res = await signIn('credentials', {
          redirect: false,
          email: acc.email,
          password: acc.password,
        });

        if (res?.ok) {
          router.push('/dashboard');
          router.refresh();
        } else {
          // If password was invalidated, prompt for password
          setSelectedAccount(acc);
          setPassword('');
          setError('Saved login info expired. Please enter your password.');
        }
      } catch (err) {
        setSelectedAccount(acc);
        setPassword('');
        setError('Failed to log in automatically.');
      } finally {
        setSwitchingEmail(null);
      }
    } else if (acc.provider === 'google') {
      setSwitchingEmail(acc.email);
      try {
        await signIn('google', { callbackUrl: '/dashboard' });
      } catch (err) {
        setError('Failed to log in with Google.');
        setSwitchingEmail(null);
      }
    } else {
      // 2. If NO saved password info -> prompt for password
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

      if (res?.error) {
        setError('Incorrect password.');
      } else {
        // Save login info to device on successful password entry
        try {
          const stored = localStorage.getItem('connected_accounts');
          let list = stored ? JSON.parse(stored) : [];
          if (!Array.isArray(list)) list = [];
          const cleanEmail = selectedAccount.email.toLowerCase().trim();
          const idx = list.findIndex((a: any) => a && a.email && a.email.toLowerCase().trim() === cleanEmail);
          const accObj = {
            email: cleanEmail,
            username: selectedAccount.username,
            name: selectedAccount.name,
            image: selectedAccount.image,
            password: password,
            provider: 'credentials'
          };
          if (idx === -1) {
            list.push(accObj);
          } else {
            list[idx] = { ...list[idx], ...accObj };
          }
          localStorage.setItem('connected_accounts', JSON.stringify(list));
        } catch (e) {}

        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred.');
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
    <div className={`min-h-screen transition-colors duration-500 font-sans ${isDark ? 'bg-[#09090b] text-white' : 'bg-[#f8f9fa] text-gray-900'}`}>
      <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-500/15">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className={`p-2.5 rounded-full border transition-all active:scale-95 ${
                isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300' : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Account Center</h1>
              <p className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                Manage saved accounts on this device
              </p>
            </div>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`p-2.5 rounded-full border transition-all active:scale-95 ${
                isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300' : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
              }`}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showDropdown && (
              <div className={`absolute right-0 mt-2 w-48 border rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200 ${
                isDark ? 'bg-[#16161a] border-zinc-800 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}>
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setViewMode(viewMode === 'list' ? 'remove' : 'list');
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === 'list' ? 'Remove an Account' : 'Done Managing'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Saved Accounts List Card */}
        <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold">Saved Accounts ({displayAccounts.length})</h2>
            {viewMode === 'remove' && (
              <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                Tap trash icon to remove
              </span>
            )}
          </div>

          <div className="space-y-3">
            {displayAccounts.map((acc) => {
              const accountName = acc.name || acc.username || acc.email.split('@')[0];
              const rawUsername = acc.username || acc.email.split('@')[0];
              const displayUsername = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
              const isActive = acc.isCurrent;
              const hasSavedInfo = !!acc.password;
              const isSwitchingThis = switchingEmail === acc.email;

              return (
                <div
                  key={acc.email}
                  onClick={() => viewMode === 'list' && handleAccountClick(acc)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    isActive
                      ? isDark ? 'border-blue-500/40 bg-blue-500/10 shadow-sm' : 'border-blue-300 bg-blue-50/70 shadow-sm'
                      : isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 cursor-pointer active:scale-98' : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer active:scale-98'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {acc.image ? (
                      <img src={acc.image} alt={accountName} className="w-11 h-11 rounded-full object-cover border border-zinc-700 flex-shrink-0" />
                    ) : (
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold uppercase flex-shrink-0 ${
                        isActive ? 'bg-blue-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {getInitials(acc)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{accountName}</span>
                        {isActive ? (
                          <span className="text-[10px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                            Active Session
                          </span>
                        ) : hasSavedInfo ? (
                          <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                            <Key className="w-2.5 h-2.5" />
                            Saved Info
                          </span>
                        ) : null}
                      </div>
                      <span className={`text-xs truncate block ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{displayUsername}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                    {isSwitchingThis ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : viewMode === 'remove' && !isActive ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveAccount(acc.email); }}
                        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : isActive ? (
                      <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : (
                      <ChevronRight className={`w-4 h-4 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Account Button */}
        <div className="mt-6">
          <button
            onClick={() => router.push('/?sheet=signIn')}
            className={`w-full py-4 rounded-3xl font-extrabold text-sm border flex items-center justify-center gap-2 transition-all active:scale-98 ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800' : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm'
            }`}
          >
            <UserPlus className="w-4 h-4 text-blue-500" />
            Add Another Account
          </button>
        </div>
      </div>

      {/* Password Prompt Modal for Non-Saved Credentials */}
      {selectedAccount && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`w-full max-w-sm border rounded-3xl p-6 shadow-2xl relative ${isDark ? 'bg-[#16161a] border-zinc-800 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
            <button
              onClick={() => setSelectedAccount(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center mb-1">Enter Password</h3>
            <p className={`text-xs text-center mb-4 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              Log into <strong className="text-blue-500">@{selectedAccount.username}</strong> to save credentials on this device.
            </p>

            {error && <div className="text-rose-400 text-xs font-bold mb-3 text-center">{error}</div>}

            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className={`w-full p-3.5 pr-10 rounded-2xl border text-xs outline-none ${
                    isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-100 border-gray-200 text-gray-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-zinc-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl transition-all shadow-md active:scale-98"
              >
                {loading ? 'Signing In...' : 'Log In & Save Info'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
