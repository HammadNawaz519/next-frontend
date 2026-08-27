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
  const [signupError, setSignupError] = useState('');
  // 'form' = filling out details, 'otp' = verifying email code
  const [signupStep, setSignupStep] = useState<'form' | 'otp'>('form');
  const [signupOtp, setSignupOtp] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [signupShowPassword, setSignupShowPassword] = useState(false);

  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // ── Forgot Password / Reset State inside Login Sheet ──
  const [loginStep, setLoginStep] = useState<'login' | 'forgot-password' | 'reset-otp' | 'success'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState(['', '', '', '', '', '']);
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [resetShowPw, setResetShowPw] = useState(false);
  const [resetShowConfirm, setResetShowConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const resetSignupSheet = () => {
    setSignupName(''); setSignupEmail(''); setSignupPhone(''); setSignupPassword('');
    setSignupError(''); setSignupStep('form');
    setSignupOtp(['', '', '', '', '', '']);
    setOtpError('');
    setSignupShowPassword(false);
  };

  const resetLoginSheet = () => {
    setLoginEmail(''); setLoginPassword(''); setLoginError('');
    setLoginStep('login');
    setResetEmail('');
    setResetOtp(['', '', '', '', '', '']);
    setResetNewPw(''); setResetConfirmPw('');
    setResetShowPw(false); setResetShowConfirm(false);
    setResetError('');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    setSignupError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: signupName,
          email: signupEmail,
          password: signupPassword,
          phone: signupPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSignupError(data.message || 'Registration failed. Please try again.');
      } else {
        // Move to OTP verification step
        setSignupStep('otp');
        setSignupOtp(['', '', '', '', '', '']);
        setOtpError('');
      }
    } catch (err) {
      setSignupError('An unexpected error occurred. Please try again.');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...signupOtp];
    newOtp[index] = digit;
    setSignupOtp(newOtp);
    if (digit && index < 5) {
      const next = document.getElementById(`ac-otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !signupOtp[index] && index > 0) {
      const prev = document.getElementById(`ac-otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setOtpError('');
    const code = signupOtp.join('');
    if (code.length < 6) {
      setOtpError('Please enter the full 6-digit code.');
      setOtpLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || 'Verification failed. Please try again.');
      } else {
        // Account created — sign in immediately and stay in the app
        const signInRes = await signIn('credentials', {
          redirect: false,
          email: signupEmail,
          password: signupPassword,
        });
        setShowSignupSheet(false);
        resetSignupSheet();
        if (signInRes?.ok) {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      setOtpError('An unexpected error occurred.');
    } finally {
      setOtpLoading(false);
    }
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
        resetLoginSheet();
        router.push('/dashboard');
      }
    } catch (err) {
      setLoginError('An unexpected error occurred.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError('');
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.message || 'Failed to send reset code.');
      } else {
        setResetOtp(['', '', '', '', '', '']);
        setResetNewPw('');
        setResetConfirmPw('');
        setLoginStep('reset-otp');
      }
    } catch (err) {
      setResetError('An unexpected error occurred. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...resetOtp];
    newOtp[index] = digit;
    setResetOtp(newOtp);
    if (digit && index < 5) {
      const next = document.getElementById(`acc-reset-otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleResetOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !resetOtp[index] && index > 0) {
      const prev = document.getElementById(`acc-reset-otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError('');
    if (resetNewPw !== resetConfirmPw) {
      setResetError('Passwords do not match.');
      setResetLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          code: resetOtp.join(''),
          newPassword: resetNewPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.message || 'Failed to reset password. Please try again.');
      } else {
        setLoginStep('success');
      }
    } catch (err) {
      setResetError('An unexpected error occurred. Please try again.');
    } finally {
      setResetLoading(false);
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
    <div style={{ minHeight: '100vh', background: '#222831', color: '#EEEEEE', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px calc(40px + env(safe-area-inset-bottom,0px))' }}>
        {/* Top Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(238,238,238,0.7)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(238,238,238,0.7)', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showDropdown && (
              <div style={{ position: 'absolute', right: 0, marginTop: 8, width: 200, background: '#393E46', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 6, zIndex: 50, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'remove' ? 'list' : 'remove'); }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13, fontWeight: 600, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === 'remove' ? 'Done Managing' : 'Remove Account'}
                </button>
                <button
                  onClick={() => { setShowDropdown(false); setViewMode(viewMode === 'removeSaved' ? 'list' : 'removeSaved'); }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13, fontWeight: 600, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(238,238,238,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  <Key className="w-4 h-4" />
                  {viewMode === 'removeSaved' ? 'Done' : 'Remove Saved Login'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CONNECT Account Center Header */}
        <div style={{ marginBottom: 32, paddingTop: 8 }}>
          {/* Brand mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #00ADB5, #007A80)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,173,181,0.25)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <h1 style={{ color: '#EEEEEE', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Account Center</h1>
              <p style={{ color: 'rgba(238,238,238,0.4)', fontSize: 12, margin: '2px 0 0' }}>Manage your CONNECT accounts</p>
            </div>
          </div>
        </div>

        {/* Clean Simple Accounts List Container — Fully Rounded Rows (Shifted Down) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          {(viewMode === 'remove' || viewMode === 'removeSaved') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Managing Saved Accounts</span>
              <button
                onClick={() => setViewMode('list')}
                style={{ fontSize: 12, fontWeight: 700, color: '#00ADB5', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Done
              </button>
            </div>
          )}

          {displayAccounts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(238,238,238,0.35)', fontSize: 14 }}>
              No accounts saved on this device yet.
            </div>
          )}

          {displayAccounts.map((acc) => {
            const displayHandle = acc.username 
              ? acc.username.replace(/^@/, '').split('@')[0] 
              : (acc.displayName ? acc.displayName : (acc.email ? acc.email.split('@')[0] : 'User'));
            const isSaved = acc.isSavedOnDevice;
            const isSwitchingThis = switchingId === acc.userId;
            const isCurrent = !!(session?.user?.email && session.user.email.toLowerCase() === acc.email.toLowerCase());

            return (
              <div
                key={acc.userId || acc.email}
                onClick={() => viewMode === 'list' && handleAccountClick(acc)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: 16,
                  border: isCurrent ? '1px solid rgba(0,173,181,0.35)' : '1px solid rgba(255,255,255,0.07)',
                  background: isCurrent ? 'rgba(0,173,181,0.07)' : '#393E46',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = '#434a53'; }}
                onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = '#393E46'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {acc.profilePicture ? (
                    <img src={acc.profilePicture} alt={displayHandle} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: isCurrent ? '2px solid #00ADB5' : '1.5px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
                      background: isCurrent ? 'rgba(0,173,181,0.2)' : 'rgba(255,255,255,0.08)',
                      color: isCurrent ? '#00ADB5' : 'rgba(238,238,238,0.6)',
                      border: isCurrent ? '2px solid rgba(0,173,181,0.4)' : '1.5px solid rgba(255,255,255,0.1)',
                    }}>
                      {getInitials(acc)}
                    </div>
                  )}
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#EEEEEE', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayHandle}</span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(0,173,181,0.15)', color: '#00ADB5', border: '1px solid rgba(0,173,181,0.25)', flexShrink: 0 }}>Active</span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'rgba(238,238,238,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginTop: 2 }}>{acc.email}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 8 }}>
                  {isSwitchingThis ? (
                    <div style={{ width: 16, height: 16, border: '2px solid #00ADB5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  ) : viewMode === 'remove' ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveAccount(acc.userId); }}
                      style={{ padding: 6, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}
                      title="Remove account from device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : viewMode === 'removeSaved' && isSaved ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveSavedLogin(acc.userId); }}
                      style={{ padding: 6, color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}
                      title="Remove saved login info"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                  ) : (
                    <ChevronRight style={{ width: 16, height: 16, color: 'rgba(238,238,238,0.3)' }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <Button
            onClick={() => { setShowLoginSheet(true); setShowSignupSheet(false); }}
            style={{ width: '100%', background: '#00ADB5', color: '#ffffff', border: 'none', height: 48, borderRadius: 14, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Log Into Another Account
          </Button>

          <Button
            onClick={() => { setShowSignupSheet(true); setShowLoginSheet(false); }}
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: '#EEEEEE', border: '1px solid rgba(255,255,255,0.1)', height: 48, borderRadius: 14, fontWeight: 500, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Create a New Account
          </Button>
        </div>
      </div>

      {/* Password Prompt Modal for Non-Saved Credentials */}
      {selectedAccount && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Inter', sans-serif" }}>
          <div style={{ background: '#393E46', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#EEEEEE', margin: '0 0 6px' }}>Enter Password</h3>
            <p style={{ fontSize: 13, color: 'rgba(238,238,238,0.5)', marginBottom: 20 }}>
              Enter password for <span style={{ color: '#EEEEEE', fontWeight: 600 }}>{selectedAccount.email}</span>
            </p>

            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#EEEEEE', height: 44, borderRadius: 12, paddingRight: 40, fontSize: 14, fontFamily: 'inherit' }}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', cursor: 'pointer', outline: 'none' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(selectedAccount.email);
                    setSelectedAccount(null);
                    setPassword('');
                    setShowLoginSheet(true);
                    setLoginStep('forgot-password');
                    setResetError('');
                  }}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setSelectedAccount(null);
                    setPassword('');
                  }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 h-10 rounded-full font-semibold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-white hover:bg-zinc-200 text-black h-10 rounded-full font-bold text-xs"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </div>
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
          onClick={() => { setShowLoginSheet(false); resetLoginSheet(); }}
        />
        <div 
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${showLoginSheet ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
        >
          {/* Top handle bar */}
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

          {/* Content */}
          <div className="relative h-full flex flex-col space-y-6">
            {/* STEP 1: LOGIN FORM */}
            {loginStep === 'login' && (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setShowLoginSheet(false); resetLoginSheet(); }}
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

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(loginEmail);
                        setResetError('');
                        setLoginStep('forgot-password');
                      }}
                      className="text-white/70 hover:text-white text-xs transition-colors font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4"
                  >
                    {loginLoading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </>
            )}

            {/* STEP 2: FORGOT PASSWORD FORM */}
            {loginStep === 'forgot-password' && (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setLoginStep('login'); setResetError(''); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
                    title="Back to Sign In"
                  >
                    <ArrowLeft className="w-4 h-4 text-white" />
                  </button>
                </div>

                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
                  <p className="text-white/70 text-sm">Enter your email to receive a reset code</p>
                </div>

                {resetError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-center font-semibold">
                    {resetError}
                  </div>
                )}

                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  <div className="space-y-2 text-left">
                    <label htmlFor="acc-reset-email" className="text-white/90 text-sm font-medium block">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                      <Input
                        id="acc-reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => { setResetEmail(e.target.value); setResetError(''); }}
                        className="pl-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                        placeholder="Enter your email"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={resetLoading || !resetEmail.trim()}
                    className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4 disabled:opacity-50"
                  >
                    {resetLoading ? 'Sending code...' : 'Send Reset Code'}
                  </Button>
                </form>
              </>
            )}

            {/* STEP 3: RESET OTP & NEW PASSWORD */}
            {loginStep === 'reset-otp' && (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setLoginStep('forgot-password'); setResetError(''); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
                    title="Back"
                  >
                    <ArrowLeft className="w-4 h-4 text-white" />
                  </button>
                </div>

                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-2xl font-semibold text-white">Check your email</h1>
                  <p className="text-white/60 text-xs">We sent a 6-digit code to</p>
                  <p className="text-white font-medium text-xs">{resetEmail}</p>
                </div>

                {resetError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-center font-semibold">
                    {resetError}
                  </div>
                )}

                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  {/* OTP inputs */}
                  <div className="flex justify-center space-x-2 my-2">
                    {resetOtp.map((digit, index) => (
                      <input
                        key={index}
                        id={`acc-reset-otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleResetOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleResetOtpKeyDown(index, e)}
                        className="w-10 h-12 text-center text-lg font-bold bg-[#1c1c1e] border border-zinc-800 text-white rounded-xl focus:outline-none focus:border-white/50 transition-colors"
                        autoFocus={index === 0}
                      />
                    ))}
                  </div>

                  {/* New password */}
                  <div className="space-y-2 text-left">
                    <label htmlFor="acc-reset-new-pw" className="text-white/90 text-sm font-medium block">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                      <Input
                        id="acc-reset-new-pw"
                        type={resetShowPw ? 'text' : 'password'}
                        value={resetNewPw}
                        onChange={(e) => { setResetNewPw(e.target.value); setResetError(''); }}
                        className="pl-10 pr-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                        placeholder="Enter new password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setResetShowPw(!resetShowPw)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                      >
                        {resetShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm new password */}
                  <div className="space-y-2 text-left">
                    <label htmlFor="acc-reset-confirm-pw" className="text-white/90 text-sm font-medium block">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                      <Input
                        id="acc-reset-confirm-pw"
                        type={resetShowConfirm ? 'text' : 'password'}
                        value={resetConfirmPw}
                        onChange={(e) => { setResetConfirmPw(e.target.value); setResetError(''); }}
                        className="pl-10 pr-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                        placeholder="Confirm new password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setResetShowConfirm(!resetShowConfirm)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                      >
                        {resetShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {resetConfirmPw && resetNewPw !== resetConfirmPw && (
                      <p className="text-xs text-red-400">Passwords do not match</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={resetLoading || resetOtp.join('').length < 6 || !resetNewPw || resetNewPw !== resetConfirmPw}
                    className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4 disabled:opacity-50"
                  >
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </Button>
                </form>
              </>
            )}

            {/* STEP 4: SUCCESS */}
            {loginStep === 'success' && (
              <div className="flex flex-col justify-center items-center space-y-6 text-center py-6">
                <div className="w-16 h-16 bg-[#1c1c1e] border border-white/10 rounded-full flex items-center justify-center">
                  <Check className="w-8 h-8 text-white" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-white">Success!</h1>
                  <p className="text-white/70 text-sm">
                    Your password has been successfully reset.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setLoginEmail(resetEmail);
                    setLoginStep('login');
                  }}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4"
                >
                  Continue to Login
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create New Account - Bottom Sheet (Sliding up from bottom) */}
      <div 
        className={`fixed inset-0 z-[10000] transition-all duration-500 ${showSignupSheet ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md" 
          onClick={() => { setShowSignupSheet(false); resetSignupSheet(); }}
        />
        <div 
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-[10001] bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 ${showSignupSheet ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}`}
        >
          {/* Top handle bar */}
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

          {/* ── STEP: Form ── */}
          {signupStep === 'form' && (
            <div className="flex flex-col space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setShowSignupSheet(false); resetSignupSheet(); }}
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

              {signupError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-center font-semibold">
                  {signupError}
                </div>
              )}

              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div className="space-y-2 text-left">
                  <label htmlFor="ac-signup-name" className="text-white/90 text-sm font-medium block">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="ac-signup-name"
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
                  <label htmlFor="ac-signup-email" className="text-white/90 text-sm font-medium block">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="ac-signup-email"
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
                  <label htmlFor="ac-signup-phone" className="text-white/90 text-sm font-medium block">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="ac-signup-phone"
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
                  <label htmlFor="ac-signup-password" className="text-white/90 text-sm font-medium block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
                    <Input
                      id="ac-signup-password"
                      type={signupShowPassword ? 'text' : 'password'}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-10 pr-10 bg-[#1c1c1e] border-zinc-800 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20 h-11 rounded-xl text-sm"
                      placeholder="Create a password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setSignupShowPassword(!signupShowPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white/70"
                    >
                      {signupShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={signupLoading}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md mt-4"
                >
                  {signupLoading ? 'Sending verification...' : 'Create Account'}
                </Button>
              </form>
            </div>
          )}

          {/* ── STEP: OTP Verification ── */}
          {signupStep === 'otp' && (
            <div className="flex flex-col space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSignupStep('form')}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
                  title="Back"
                >
                  <ArrowLeft className="w-4 h-4 text-white" />
                </button>
              </div>

              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-white/10 border border-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-semibold text-white">Check your email</h1>
                <p className="text-white/60 text-sm">We sent a 6-digit code to</p>
                <p className="text-white font-semibold text-sm">{signupEmail}</p>
              </div>

              {otpError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-center font-semibold">
                  {otpError}
                </div>
              )}

              <form onSubmit={handleOtpVerify} className="space-y-6">
                <div className="flex justify-center gap-2">
                  {signupOtp.map((digit, i) => (
                    <input
                      key={i}
                      id={`ac-otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-14 text-center text-xl font-bold bg-[#1c1c1e] border border-zinc-700 text-white rounded-2xl focus:outline-none focus:border-white/60 transition-colors"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={otpLoading || signupOtp.join('').length < 6}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-bold h-11 rounded-full text-sm transition-all duration-200 shadow-md"
                >
                  {otpLoading ? 'Verifying...' : 'Verify & Create Account'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
