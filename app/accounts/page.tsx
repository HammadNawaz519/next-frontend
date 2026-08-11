'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Trash2, UserPlus, Lock, Eye, EyeOff, X, ArrowLeft,
  ChevronRight, Check, Key, Shield, LogIn
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/app/components/ThemeProvider';
import { DeviceAccountStore, DeviceAccountMeta } from '@/lib/deviceAccountStore';

// Extend DeviceAccountMeta with computed UI property
type AccountDisplay = DeviceAccountMeta & { isCurrent: boolean };

const GrainGradient = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
  { ssr: false }
);

export default function AccountsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  // ── Three SEPARATE concepts ──
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccountMeta[]>([]); // Saved on device
  const [viewMode, setViewMode] = useState<'list' | 'remove' | 'removeSaved'>('list');
  const [showDropdown, setShowDropdown] = useState(false);

  // Password Modal for accounts without saved credentials
  const [selectedAccount, setSelectedAccount] = useState<DeviceAccountMeta | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const curUserId = (session?.user as any)?.id || '';
  const curEmail = session?.user?.email?.toLowerCase().trim() || '';

  // ── Load all device accounts on mount and after any changes ──
  const loadAccounts = () => {
    const accounts = DeviceAccountStore.getSavedAccounts();
    setSavedAccounts(accounts);
  };

  useEffect(() => {
    setMounted(true);
    loadAccounts();
  }, []);

  // Build displayAccounts: current account pinned at top with Active badge
  const displayAccounts = React.useMemo(() => {
    return savedAccounts.map(acc => ({
      ...acc,
      isCurrent: acc.userId === curUserId || acc.email === curEmail,
    } as AccountDisplay)).sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    });
  }, [savedAccounts, curUserId, curEmail]);

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

  // ── RULE 23: Remove entire account record from device ──
  const handleRemoveAccount = async (userId: string) => {
    await DeviceAccountStore.removeAccount(userId);
    loadAccounts();
    if (displayAccounts.filter(a => !a.isCurrent).length === 0) setViewMode('list');
  };

  // ── RULE 11 / 23: Remove only the saved credential, keep the account visible ──
  const handleRemoveSavedLogin = async (userId: string) => {
    await DeviceAccountStore.removeSavedLogin(userId);
    loadAccounts();
  };

  // ── Account click handler ──
  const handleAccountClick = async (acc: AccountDisplay) => {
    if (acc.isCurrent) return;

    // Check for valid saved credential
    const hasCredential = await DeviceAccountStore.hasValidCredential(acc.userId);

    if (hasCredential && acc.isSavedOnDevice) {
      // ── RULE 6: Instant passwordless switch ──
      setSwitchingId(acc.userId);
      try {
        const res = await signIn('credentials', {
          redirect: false,
          email: acc.email,
          password: '__session_restore__',
        });
        if (res?.ok) {
          await DeviceAccountStore.refreshCredential(acc.userId, acc.provider);
          DeviceAccountStore.setCurrentAccountId(acc.userId);
          router.push('/dashboard');
          router.refresh();
          return;
        }
        // Credential invalidated by backend — fall through to password prompt
        await DeviceAccountStore.removeSavedLogin(acc.userId);
        loadAccounts();
      } catch (err) {}
      setSwitchingId(null);
    }

    // ── RULE 7: No valid credential — prompt for password ──
    setSelectedAccount(acc);
    setPassword('');
    setError('');
    setShowPassword(false);
  };

  // ── Handle manual password login for unsaved accounts ──
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
        // ── RULE 21: Save credential on successful auth, add to saved accounts ──
        const meta: Omit<DeviceAccountMeta, 'isSavedOnDevice' | 'lastUsedAt'> = {
          userId: selectedAccount.userId,
          email: selectedAccount.email,
          username: selectedAccount.username,
          displayName: selectedAccount.displayName,
          profilePicture: selectedAccount.profilePicture,
          provider: selectedAccount.provider,
        };
        await DeviceAccountStore.addOrUpdateAccount(meta, true);
        DeviceAccountStore.setCurrentAccountId(selectedAccount.userId);
        loadAccounts();
        setSelectedAccount(null);
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (acc: DeviceAccountMeta) => {
    if (acc.username) return acc.username.slice(0, 2).toUpperCase();
    if (acc.displayName) return acc.displayName.slice(0, 2).toUpperCase();
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
                Saved accounts on this device
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
              <div className={`absolute right-0 mt-2 w-56 border rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200 ${
                isDark ? 'bg-[#16161a] border-zinc-800 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'remove' ? 'list' : 'remove'); }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === 'remove' ? 'Done Managing' : 'Remove an Account'}
                </button>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'removeSaved' ? 'list' : 'removeSaved'); }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors ${isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Key className="w-4 h-4" />
                  {viewMode === 'removeSaved' ? 'Done' : 'Remove Saved Login'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Account Legend */}
        <div className={`flex items-center gap-4 mb-4 px-1 text-xs font-semibold ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Saved on this device
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" />
            Sign in required
          </div>
        </div>

        {/* Saved Accounts List */}
        <div className={`p-6 rounded-3xl border ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'}`}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold">Accounts ({displayAccounts.length})</h2>
            {(viewMode === 'remove' || viewMode === 'removeSaved') && (
              <button
                onClick={() => setViewMode('list')}
                className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
              >
                Done
              </button>
            )}
          </div>

          <div className="space-y-3">
            {displayAccounts.length === 0 && (
              <p className={`text-sm text-center py-6 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                No accounts saved on this device yet.
              </p>
            )}

            {displayAccounts.map((acc) => {
              const accountName = acc.displayName || acc.username || acc.email.split('@')[0];
              const displayUsername = acc.username || acc.email.split('@')[0];
              const isActive = acc.isCurrent;
              const isSaved = acc.isSavedOnDevice;
              const isSwitchingThis = switchingId === acc.userId;

              return (
                <div
                  key={acc.userId || acc.email}
                  onClick={() => viewMode === 'list' && !isActive && handleAccountClick(acc)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    isActive
                      ? isDark ? 'border-blue-500/40 bg-blue-500/10' : 'border-blue-300 bg-blue-50/70'
                      : viewMode === 'list'
                        ? isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 cursor-pointer' : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer'
                        : isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {acc.profilePicture ? (
                      <img src={acc.profilePicture} alt={accountName} className="w-11 h-11 rounded-full object-cover border border-zinc-700 flex-shrink-0" />
                    ) : (
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold uppercase flex-shrink-0 ${
                        isActive ? 'bg-blue-600 text-white' : isDark ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {getInitials(acc)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold truncate">{accountName}</span>
                        {isActive ? (
                          <span className="text-[9px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                            Active Session
                          </span>
                        ) : isSaved ? (
                          <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            Saved on this device
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold bg-zinc-500/20 text-zinc-500 px-2 py-0.5 rounded-full flex-shrink-0">
                            Sign in required
                          </span>
                        )}
                      </div>
                      <span className={`text-xs truncate block ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>@{displayUsername}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                    {isSwitchingThis ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : viewMode === 'remove' && !isActive ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveAccount(acc.userId); }}
                        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                        title="Remove account from device"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : viewMode === 'removeSaved' && isSaved && !isActive ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveSavedLogin(acc.userId); }}
                        className="p-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 rounded-xl transition-colors"
                        title="Remove saved login info"
                      >
                        <Key className="w-4 h-4" />
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

        {/* Security Note */}
        <div className={`mt-4 p-4 rounded-2xl border flex items-start gap-3 ${isDark ? 'bg-zinc-900/30 border-zinc-800' : 'bg-gray-50 border-gray-200'}`}>
          <Shield className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`} />
          <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
            Accounts marked <strong>Saved on this device</strong> can switch without entering a password. 
            Credentials are stored securely per account on this device only. 
            Use <em>Remove Saved Login</em> to require sign-in next time.
          </p>
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
              onClick={() => { setSelectedAccount(null); setError(''); }}
              className={`absolute top-4 right-4 p-1.5 rounded-full ${isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center mb-1">Sign In Required</h3>
            <p className={`text-xs text-center mb-4 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
              Log into <strong className="text-blue-500">@{selectedAccount.username}</strong>.<br />
              Your login info will be saved on this device.
            </p>

            {error && <div className="text-rose-400 text-xs font-bold mb-3 text-center bg-rose-500/10 px-3 py-2 rounded-xl">{error}</div>}

            <form onSubmit={handlePasswordLogin} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className={`w-full p-3.5 pr-10 rounded-2xl border text-sm outline-none ${
                    isDark ? 'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500' : 'bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-zinc-400 hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Log In & Save on Device
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
