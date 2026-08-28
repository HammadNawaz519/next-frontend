'use client';

import React, { useState, useRef, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardPage from './dashboard/page';
import { DeviceAccountStore } from '@/lib/deviceAccountStore';
import {
  MessageCircle,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

type AuthView = 'main' | 'verify' | 'forgot-password' | 'verify-reset' | 'new-password' | 'success';
type AuthTab = 'signIn' | 'signUp';

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const sessStatus = status as string;

  // View & Tab State
  const [view, setView] = useState<AuthView>('main');
  const [tab, setTab] = useState<AuthTab>('signIn');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP State (6 Digits)
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend Timer Countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Sync active session in localStorage
  useEffect(() => {
    if (sessStatus === 'authenticated' && session?.user) {
      try {
        localStorage.setItem('has_active_session', 'true');
        localStorage.setItem('last_logged_user', JSON.stringify(session.user));
      } catch (e) {}
    } else if (sessStatus === 'unauthenticated') {
      try {
        localStorage.removeItem('has_active_session');
        localStorage.removeItem('last_logged_user');
      } catch (e) {}
    }
  }, [sessStatus, session]);

  // If user is already authenticated, show the dashboard directly
  if (sessStatus === 'authenticated' && session?.user) {
    return <DashboardPage />;
  }

  // ── OTP Handlers ──────────────────────────────────────────────────────────
  const handleOtpChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      const next = [...otp];
      next[index] = '';
      setOtp(next);
      return;
    }
    const digit = raw[raw.length - 1];
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (index < 5) {
      requestAnimationFrame(() => otpRefs.current[index + 1]?.focus());
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp];
        next[index] = '';
        setOtp(next);
      } else if (index > 0) {
        const next = [...otp];
        next[index - 1] = '';
        setOtp(next);
        otpRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length > 0) {
      const next = ['', '', '', '', '', ''];
      text.split('').forEach((d, idx) => { next[idx] = d; });
      setOtp(next);
      const targetFocus = Math.min(text.length, 5);
      requestAnimationFrame(() => otpRefs.current[targetFocus]?.focus());
    }
    e.preventDefault();
  };

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    triggerHaptic('medium');
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await signIn('credentials', { redirect: false, email, password });
      if (res?.error === 'EMAIL_NOT_VERIFIED') {
        setOtp(['', '', '', '', '', '']);
        setInfo('Please enter the verification code sent to your email.');
        setView('verify');
        setLoading(false);
      } else if (res?.error) {
        setError('Invalid email or password.');
        setLoading(false);
      } else if (res?.ok) {
        try {
          const cleanEmail = email.toLowerCase().trim();
          await DeviceAccountStore.addOrUpdateAccount({
            userId: `pending_${cleanEmail}`,
            email: cleanEmail,
            username: cleanEmail.split('@')[0],
            displayName: cleanEmail.split('@')[0],
            profilePicture: '',
            provider: 'credentials',
          }, true);
        } catch (e) {}
        router.push('/dashboard');
      } else {
        setError('Sign in failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  // ── Sign Up ───────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    triggerHaptic('medium');
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Registration failed.');
        setLoading(false);
      } else {
        setOtp(['', '', '', '', '', '']);
        setResendCooldown(60);
        setInfo(`We sent a 6-digit code to ${email}`);
        setView('verify');
        setLoading(false);
      }
    } catch (err) {
      setError('Signup failed. Please try again.');
      setLoading(false);
    }
  };

  // ── Verify Email OTP ──────────────────────────────────────────────────────
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits.');
      return;
    }
    triggerHaptic('medium');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Verification failed.');
        setLoading(false);
      } else {
        const signInRes = await signIn('credentials', { redirect: false, email, password });
        setLoading(false);
        if (signInRes?.ok) {
          try {
            const cleanEmail = email.toLowerCase().trim();
            await DeviceAccountStore.addOrUpdateAccount({
              userId: `pending_${cleanEmail}`,
              email: cleanEmail,
              username: username || cleanEmail.split('@')[0],
              displayName: username || cleanEmail.split('@')[0],
              profilePicture: '',
              provider: 'credentials',
            }, true);
          } catch (e) {}
          setView('success');
        } else {
          setInfo('Email verified! Please sign in.');
          setView('main');
          setTab('signIn');
        }
      }
    } catch (err) {
      setError('Verification failed. Please check connection.');
      setLoading(false);
    }
  };

  // ── Forgot Password: Send Code ────────────────────────────────────────────
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email.');
      return;
    }
    triggerHaptic('medium');
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to send reset code.');
        setLoading(false);
      } else {
        setLoading(false);
        setResendCooldown(60);
        setOtp(['', '', '', '', '', '']);
        setInfo(data.message || `Reset code sent to ${email}`);
        setView('verify-reset');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  // ── Forgot Password: Verify Code ──────────────────────────────────────────
  const handleVerifyResetCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits.');
      return;
    }
    triggerHaptic('light');
    setError('');
    setInfo('');
    setView('new-password');
  };

  // ── Forgot Password: Set New Password ─────────────────────────────────────
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const code = otp.join('');
    triggerHaptic('medium');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to reset password.');
        setLoading(false);
      } else {
        setLoading(false);
        setInfo('Password reset successfully! Please sign in with your new password.');
        setPassword('');
        setConfirmPassword('');
        setView('main');
        setTab('signIn');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  // ── Resend Code ───────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    triggerHaptic('light');
    setError('');
    setInfo('Sending new code...');
    try {
      const endpoint = view === 'verify-reset' ? '/api/forgot-password' : '/api/resend-code';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setInfo('New code sent! Check your inbox.');
        setResendCooldown(60);
        setOtp(['', '', '', '', '', '']);
      } else {
        setError(data.message || 'Failed to resend code.');
        setInfo('');
      }
    } catch {
      setError('Connection error. Please try again.');
      setInfo('');
    }
  };

  // Dynamic Header Title & Subtitle based on View
  const getHeaderMeta = () => {
    switch (view) {
      case 'verify':
        return {
          title: 'Verify Email',
          subtitle: `Enter the 6-digit code sent to ${email || 'your email'}`,
        };
      case 'forgot-password':
        return {
          title: 'Forgot Password',
          subtitle: 'Enter your email to receive a password reset code',
        };
      case 'verify-reset':
        return {
          title: 'Reset Verification',
          subtitle: `Enter the 6-digit reset code sent to ${email || 'your email'}`,
        };
      case 'new-password':
        return {
          title: 'New Password',
          subtitle: 'Create a strong new password for your account',
        };
      case 'success':
        return {
          title: 'Welcome to Connect',
          subtitle: 'Your account is ready and verified!',
        };
      default:
        return tab === 'signIn'
          ? { title: 'Welcome Back', subtitle: 'Sign in to continue chatting with your friends' }
          : { title: 'Create Account', subtitle: 'Join Connect and experience seamless encrypted messaging' };
    }
  };

  const headerMeta = getHeaderMeta();

  return (
    <div className="fixed inset-0 h-screen w-full flex flex-col bg-[#141111] overflow-hidden font-sans select-none">
      
      {/* ── 1. TOP DARK REGION: BRANDING & HEADLINE ── */}
      <div className="w-full bg-[#141111] pt-14 pb-8 px-6 flex flex-col items-center relative select-none shrink-0">
        {/* Back Button for Sub-views */}
        {view !== 'main' && view !== 'success' && (
          <button
            onClick={() => {
              triggerHaptic('light');
              setError('');
              setInfo('');
              setView('main');
            }}
            className="absolute top-14 left-5 p-2 text-white/80 hover:text-white active:scale-90 transition-all cursor-pointer outline-none bg-transparent"
            title="Back"
          >
            <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.4} />
          </button>
        )}

        {/* App Logo Icon */}
        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shadow-lg mb-3">
          <MessageCircle className="w-7 h-7 text-[#D8B4E2]" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-[22px] font-black text-white tracking-tight leading-tight text-center">
          {headerMeta.title}
        </h1>
        <p className="text-[13px] text-zinc-400 mt-1 text-center max-w-xs font-normal">
          {headerMeta.subtitle}
        </p>
      </div>

      {/* ── 2. BOTTOM WHITE SHEET CONTAINER ── */}
      <div className="w-full flex-1 bg-white rounded-t-[32px] px-6 pt-5 pb-8 flex flex-col relative shadow-[0_-12px_35px_rgba(0,0,0,0.15)] overflow-y-auto no-scrollbar min-h-0 text-zinc-900">
        
        {/* Sheet Drag Handle */}
        <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto -mt-1 mb-4 shrink-0" />

        {/* Alerts / Error Messages */}
        {error && (
          <div className="w-full max-w-[420px] mx-auto mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-[13px] font-medium flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="w-full max-w-[420px] mx-auto mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-800 text-[13px] font-medium flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{info}</span>
          </div>
        )}

        {/* ── VIEW A: MAIN SIGN IN / SIGN UP ── */}
        {view === 'main' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col gap-4">
            
            {/* Segmented Pill Tabs */}
            <div className="w-full bg-zinc-100 p-1 rounded-full flex items-center mb-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setError('');
                  setInfo('');
                  setTab('signIn');
                }}
                className={`flex-1 py-2.5 rounded-full text-[13.5px] font-bold transition-all cursor-pointer ${
                  tab === 'signIn'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setError('');
                  setInfo('');
                  setTab('signUp');
                }}
                className={`flex-1 py-2.5 rounded-full text-[13.5px] font-bold transition-all cursor-pointer ${
                  tab === 'signUp'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Form Inputs */}
            <form
              onSubmit={tab === 'signIn' ? handleSignIn : handleSignUp}
              className="flex flex-col gap-3.5"
            >
              {tab === 'signUp' && (
                <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                  <User className="w-5 h-5 text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    required
                    className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                  />
                </div>
              )}

              {/* Email Input */}
              <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                <Mail className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
              </div>

              {/* Password Input */}
              <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                <Lock className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-zinc-400 hover:text-zinc-600 outline-none p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Forgot Password Link on Sign In */}
              {tab === 'signIn' && (
                <div className="flex justify-end pr-2 -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setError('');
                      setInfo('');
                      setView('forgot-password');
                    }}
                    className="text-[12.5px] text-zinc-500 hover:text-zinc-900 font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-1"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{tab === 'signIn' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-zinc-200" />
              <span className="text-[12px] text-zinc-400 font-medium uppercase">Or</span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={() => {
                setGoogleLoading(true);
                signIn('google', { callbackUrl: '/dashboard' });
              }}
              disabled={googleLoading}
              className="w-full h-13 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold text-[14px] rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        {/* ── VIEW B: VERIFY EMAIL OTP ── */}
        {view === 'verify' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col gap-5">
            <form onSubmit={handleVerifyEmail} className="flex flex-col gap-5">
              {/* 6 Digit Centered Inputs */}
              <div className="flex items-center justify-center gap-2.5">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                    className="w-12 h-14 text-center text-xl font-bold rounded-2xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Verify Email</span>
                )}
              </button>
            </form>

            {/* Resend Action */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-[13px] text-zinc-500 hover:text-zinc-900 font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Resend verification code'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW C: FORGOT PASSWORD (EMAIL) ── */}
        {view === 'forgot-password' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col gap-4">
            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
              <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                <Mail className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your account email"
                  required
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Send Reset Code</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── VIEW D: VERIFY RESET CODE ── */}
        {view === 'verify-reset' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col gap-5">
            <form onSubmit={handleVerifyResetCode} className="flex flex-col gap-5">
              <div className="flex items-center justify-center gap-2.5">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                    className="w-12 h-14 text-center text-xl font-bold rounded-2xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-zinc-900 outline-none transition-all"
                  />
                ))}
              </div>

              <button
                type="submit"
                className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-[13px] text-zinc-500 hover:text-zinc-900 font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Resend code'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW E: SET NEW PASSWORD ── */}
        {view === 'new-password' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col gap-4">
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-3.5">
              <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                <Lock className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  required
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-zinc-400 hover:text-zinc-600 outline-none p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="w-full h-14 bg-zinc-50 border border-zinc-200/80 rounded-full px-5 flex items-center gap-3 focus-within:bg-white focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/5 transition-all">
                <Lock className="w-5 h-5 text-zinc-400 shrink-0" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  className="w-full bg-transparent text-[14.5px] text-zinc-900 placeholder:text-zinc-400 font-normal outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-zinc-400 hover:text-zinc-600 outline-none p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-1"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <span>Reset & Sign In</span>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── VIEW F: SUCCESS VIEW ── */}
        {view === 'success' && (
          <div className="w-full max-w-[420px] mx-auto flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-[20px] font-bold text-zinc-900">Email Verified!</h2>
            <p className="text-[13.5px] text-zinc-500 -mt-2">
              Your account is now ready. Click below to launch your dashboard.
            </p>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full h-14 bg-[#141111] hover:bg-black text-white font-bold text-[15px] rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer mt-2"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
