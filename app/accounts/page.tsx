'use client';

import React, { useState, useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Trash2, UserPlus, Lock, Eye, EyeOff, X, ArrowLeft,
  ChevronRight, Check, Key, Shield, LogIn, Mail, User, Phone
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTheme } from '@/app/components/ThemeProvider';
import { DeviceAccountStore, DeviceAccountMeta } from '@/lib/deviceAccountStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

  // Signup & Login Modal State
  const [showSignupSheet, setShowSignupSheet] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    setTimeout(() => {
      setSignupLoading(false);
      setShowSignupSheet(false);
      setSignupName(''); setSignupEmail(''); setSignupPhone(''); setSignupPassword('');
    }, 1500);
  };

  const handleManualLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: loginEmail,
        password: loginPassword,
      });
      if (res?.error) {
        setLoginError('Invalid credentials. Please check your email and password.');
      } else {
        setShowLoginSheet(false);
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setLoginError('An unexpected error occurred.');
    } finally {
      setLoginLoading(false);
    }
  };

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
      <div className="max-w-xl mx-auto px-5 pt-8 pb-10 md:pt-12">
        {/* Top Header Controls */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/dashboard')}
            className={`p-2 px-3 rounded-full transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold ${
              isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300' : 'bg-gray-200/80 hover:bg-gray-200 text-gray-800'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`p-2 rounded-full transition-all active:scale-95 ${
                isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300' : 'bg-gray-200/80 hover:bg-gray-200 text-gray-800'
              }`}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showDropdown && (
              <div className={`absolute right-0 mt-2 w-52 border rounded-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-200 ${
                isDark ? 'bg-[#16161a] border-zinc-800 text-white' : 'bg-white border-gray-200 text-gray-900'
              }`}>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'remove' ? 'list' : 'remove'); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === 'remove' ? 'Done Managing' : 'Remove Account'}
                </button>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'removeSaved' ? 'list' : 'removeSaved'); }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors ${isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Key className="w-4 h-4" />
                  {viewMode === 'removeSaved' ? 'Done' : 'Remove Saved Login'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Top-Left Charcoal Black 2-Line Header (NO LOGO, NO SUBTITLE) */}
        <div className="text-left mb-8 pt-3">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.08] text-[#1c1c22] dark:text-zinc-100 font-sans">
            Account<br />Center
          </h1>
        </div>

        {/* Clean Simple Accounts List Container — Fully Rounded Rows (Shifted Down) */}
        <div className="flex flex-col gap-3 mb-10">
          {(viewMode === 'remove' || viewMode === 'removeSaved') && (
            <div className="flex items-center justify-between py-2 px-1">
              <span className="text-xs font-bold text-amber-500">Managing Saved Accounts</span>
              <button
                onClick={() => setViewMode('list')}
                className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {displayAccounts.length === 0 && (
            <p className={`text-sm text-center py-8 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              No accounts saved on this device yet.
            </p>
          )}

          {displayAccounts.map((acc) => {
            const displayHandle = acc.username 
              ? acc.username.replace(/^@/, '').split('@')[0] 
              : (acc.displayName ? acc.displayName : (acc.email ? acc.email.split('@')[0] : 'User'));
            const isSaved = acc.isSavedOnDevice;
            const isSwitchingThis = switchingId === acc.userId;

            return (
              <div
                key={acc.userId || acc.email}
                onClick={() => viewMode === 'list' && handleAccountClick(acc)}
                className={`flex items-center justify-between py-3.5 px-5 rounded-full border transition-all cursor-pointer ${
                  isDark ? 'border-zinc-800 bg-[#16161a] hover:bg-zinc-800/50' : 'border-gray-200 bg-[#f9fafb] hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {acc.profilePicture ? (
                    <img src={acc.profilePicture} alt={displayHandle} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold uppercase flex-shrink-0 ${
                      isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {getInitials(acc)}
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <span className="text-sm font-bold truncate block">{displayHandle}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                  {isSwitchingThis ? (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : viewMode === 'remove' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveAccount(acc.userId); }}
                      className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Remove account from device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : viewMode === 'removeSaved' && isSaved ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveSavedLogin(acc.userId); }}
                      className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                      title="Remove saved login info"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${isDark ? 'text-zinc-600' : 'text-gray-400'}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Action Buttons: Log Into Another Account */}
        <div className="flex flex-col gap-3.5 pt-2">
          <Button
            onClick={() => setShowLoginSheet(true)}
            className="w-full bg-[#1c1c1e] hover:bg-zinc-800 text-white border border-zinc-800 h-12 rounded-full font-bold text-xs transition-all duration-200 shadow-md"
          >
            Log Into Existing Account
          </Button>

          <Button
            onClick={() => setShowSignupSheet(true)}
            className="w-full bg-white hover:bg-zinc-100 text-[#121214] border border-gray-200 h-12 rounded-full font-bold text-xs transition-all duration-200 shadow-sm"
          >
            Create a New Account
          </Button>
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

      {/* Log Into Another Account - Bottom Sheet (Sliding up from bottom) */}
      <div 
        className={`fixed inset-0 z-[500] transition-all duration-500 ${showLoginSheet ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
          onClick={() => setShowLoginSheet(false)}
        />
        <div 
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${showLoginSheet ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
        >
          {/* Top handle bar */}
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

          {/* Content */}
          <div className="relative h-full flex flex-col space-y-6">
            {/* Top bar back button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowLoginSheet(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-white">Welcome Back</h1>
              <p className="text-white/70">Sign in to your account</p>
            </div>

            {loginError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-center font-semibold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleManualLoginSubmit} className="space-y-4">
              <div className="space-y-2 text-left">
                <label htmlFor="login-email" className="text-white/90 text-sm font-medium block">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="pl-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label htmlFor="login-password" className="text-white/90 text-sm font-medium block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="pl-10 pr-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4"
              >
                {loginLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Create New Account - Bottom Sheet (Sliding up from bottom) */}
      <div 
        className={`fixed inset-0 z-[500] transition-all duration-500 ${showSignupSheet ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
          onClick={() => setShowSignupSheet(false)}
        />
        <div 
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${showSignupSheet ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
        >
          {/* Top handle bar */}
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

          {/* Content */}
          <div className="relative h-full flex flex-col space-y-6">
            {/* Top bar back button */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowSignupSheet(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-white">Create Account</h1>
              <p className="text-white/70">Join us today</p>
            </div>

            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="space-y-2 text-left">
                <label htmlFor="signup-name" className="text-white/90 text-sm font-medium block">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="signup-name"
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="pl-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label htmlFor="signup-email" className="text-white/90 text-sm font-medium block">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="pl-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label htmlFor="signup-phone" className="text-white/90 text-sm font-medium block">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="signup-phone"
                    type="tel"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    className="pl-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Enter your phone number (+92...)"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <label htmlFor="signup-password" className="text-white/90 text-sm font-medium block">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                  <Input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="pl-10 pr-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                    placeholder="Create a password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={signupLoading}
                className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4"
              >
                {signupLoading ? 'Creating account...' : 'Sign Up'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
