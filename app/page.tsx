'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type SheetState = 
  | 'welcome' 
  | 'signIn' 
  | 'signUp' 
  | 'forgotPassword' 
  | 'verifyReset' 
  | 'resetPassword' 
  | 'verify' 
  | 'success' 
  | 'none';

interface SuccessUser {
  email: string;
  username?: string;
  image?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const sessStatus = status as string;

  // Bottom sheets state management
  const [activeSheet, setActiveSheet] = useState<SheetState>('welcome');
  const [targetSheet, setTargetSheet] = useState<SheetState>('welcome');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  // OTP state
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // UI state
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [successUser, setSuccessUser] = useState<SuccessUser | null>(null);

  // Redirect authenticated users
  useEffect(() => {
    if (sessStatus === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [sessStatus, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Dynamic header contents for the top-left screen title above sheets
  const getHeaderContent = () => {
    switch (targetSheet) {
      case 'signIn':
        return {
          title: "Sign In",
          subtitle: "Welcome back! Please enter your credentials to access dashboard"
        };
      case 'signUp':
        return {
          title: "Sign Up",
          subtitle: "Create a free account to join direct chatting chats"
        };
      case 'forgotPassword':
        return {
          title: "Forgot Password",
          subtitle: "Enter your email to receive a recovery verification code"
        };
      case 'verifyReset':
        return {
          title: "Verify Reset Code",
          subtitle: `We sent a 6-digit reset code to ${email}`
        };
      case 'resetPassword':
        return {
          title: "Set New Password",
          subtitle: "Create a strong new password to secure your account"
        };
      case 'verify':
        return {
          title: "Verify Email",
          subtitle: `We sent a 6-digit code to ${email}`
        };
      case 'success':
        return {
          title: "Verified!",
          subtitle: "Your email has been verified and your secure account is ready"
        };
      default:
        return { title: "", subtitle: "" };
    }
  };

  const headerContent = getHeaderContent();

  // Handle slide sheet transitions with animations
  const triggerSheetTransition = (nextSheet: SheetState) => {
    setTargetSheet(nextSheet);
    // Slide current sheet down
    setActiveSheet('none');
    // Wait for slide down transition to complete, then slide new sheet up
    setTimeout(() => {
      setActiveSheet(nextSheet);
    }, 350);
  };

  // Show loader while resolving session
  if (sessStatus === 'loading' || sessStatus === 'authenticated') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999]">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
      </div>
    );
  }

  // OTP handlers
  const handleOtpChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      const next = [...otp];
      next[i] = '';
      setOtp(next);
      if (i > 0) requestAnimationFrame(() => otpRefs.current[i - 1]?.focus());
      return;
    }

    if (raw.length > 1) {
      const digits = raw.slice(0, 6 - i).split('');
      const next = [...otp];
      digits.forEach((d, offset) => { if (i + offset < 6) next[i + offset] = d; });
      setOtp(next);
      const nextIdx = Math.min(i + digits.length, 5);
      requestAnimationFrame(() => otpRefs.current[nextIdx]?.focus());
      return;
    }

    const next = [...otp];
    next[i] = raw;
    setOtp(next);
    if (i < 5) requestAnimationFrame(() => otpRefs.current[i + 1]?.focus());
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      requestAnimationFrame(() => otpRefs.current[i - 1]?.focus());
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { redirect: false, email, password });
    if (res?.error === 'EMAIL_NOT_VERIFIED') {
      setError('');
      setOtp(['', '', '', '', '', '']);
      triggerSheetTransition('verify');
      setInfo("Your email isn't verified yet. We've sent a new code.");
      fetch('/api/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResendCooldown(60);
      setLoading(false);
    } else if (res?.error) {
      setError('Invalid email or password.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  // ── Sign Up ───────────────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
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
        setInfo('');
        setResendCooldown(60);
        triggerSheetTransition('verify');
        setLoading(false);
        setTimeout(() => otpRefs.current[0]?.focus(), 150);
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the full 6-digit code.'); return; }
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
          setSuccessUser({ email, username });
          triggerSheetTransition('success');
        } else {
          setError('Verified! Please sign in to continue.');
          triggerSheetTransition('signIn');
        }
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ── Forgot Password OTP flows ─────────────────────────────────────────────
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    // Simulate sending 6-digit verification code with 1-min timer
    setTimeout(() => {
      setLoading(false);
      setResendCooldown(60);
      setOtp(['', '', '', '', '', '']);
      setInfo('Reset code sent to ' + email);
      triggerSheetTransition('verifyReset');
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    }, 1000);
  };

  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter the full 6-digit code.'); return; }
    setLoading(true);
    setError('');
    setTimeout(() => {
      setLoading(false);
      setInfo('');
      triggerSheetTransition('resetPassword');
    }, 1000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    // Simulate database update
    setTimeout(() => {
      setLoading(false);
      setInfo('Password reset successfully!');
      setPassword('');
      setConfirmPassword('');
      triggerSheetTransition('signIn');
    }, 1200);
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setInfo('Sending new code...');
    try {
      const res = await fetch('/api/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setInfo('');
        setError(data.message);
        setResendCooldown(data.wait || 60);
      } else if (res.ok) {
        setInfo('New code sent! Check your inbox.');
        setResendCooldown(60);
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
      } else {
        setError(data.message || 'Failed to resend.');
        setInfo('');
      }
    } catch {
      setError('An error occurred.');
      setInfo('');
    }
  };

  return (
    <div className="relative h-screen w-full bg-white flex flex-col justify-between overflow-hidden select-none font-sans">
      
      {/* Elegant Centered Brand Block (only visible in Welcome sheet) */}
      <div 
        className={`absolute inset-x-0 top-[20vh] flex flex-col items-center justify-center text-center px-4 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
          activeSheet === 'welcome' 
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 scale-75 -translate-y-12 pointer-events-none'
        }`}
      >
        <img 
          src="/logo.png" 
          alt="Connect Logo" 
          className="w-16 h-16 object-contain rounded-2xl mb-4 shadow-sm bg-black"
        />
        <h1 className="text-4xl font-extrabold tracking-widest text-[#121214] uppercase">
          Connect
        </h1>
        <p className="text-xs tracking-[0.2em] font-medium text-zinc-500 uppercase mt-2">
          A Chatting App
        </p>
      </div>

      {/* Dynamic Top Left Header Block (visible on Sign In, Sign Up, etc.) */}
      <div 
        className={`absolute top-[8vh] left-8 right-8 text-left z-10 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
          activeSheet !== 'welcome' && activeSheet !== 'none'
            ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' 
            : 'opacity-0 -translate-x-8 scale-95 pointer-events-none'
        }`}
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-[#121214]">
          {headerContent.title}
        </h1>
        <p className="text-xs text-zinc-500 font-medium tracking-wide mt-1.5 leading-relaxed">
          {headerContent.subtitle}
        </p>
      </div>

      {/* ── SHEET 1: WELCOME SHEET (Full width on bottom, taller pb-12 height) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'welcome' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Handle bar */}
        <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

        <h2 className="text-2xl font-bold text-white mb-2">Welcome</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-8">
          Welcome to Connect. Experience lightning-fast text messaging, clean high-fidelity audio/video calls, and private communication logs.
        </p>

        <div className="flex gap-4 justify-between w-full">
          <button
            onClick={() => triggerSheetTransition('signIn')}
            className="flex-1 py-3.5 bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 font-bold rounded-full text-center text-sm shadow-md"
          >
            Sign In
          </button>
          <button
            onClick={() => triggerSheetTransition('signUp')}
            className="flex-1 py-3.5 bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700 transition-all active:scale-95 font-bold rounded-full text-center text-sm"
          >
            Sign Up
          </button>
        </div>
      </div>

      {/* ── SHEET 2: SIGN IN SHEET (Full width on bottom, taller pb-12 height) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'signIn' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar back button */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => triggerSheetTransition('welcome')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
            title="Back"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-12 h-1 bg-[#27272a] rounded-full" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4">
            {info}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email Address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <div className="text-right">
            <span 
              onClick={() => triggerSheetTransition('forgotPassword')}
              className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer"
            >
              Forgot Password?
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center gap-3 text-zinc-600 text-xs my-4">
          <div className="h-[1px] flex-1 bg-zinc-800" />
          <span>or</span>
          <div className="h-[1px] flex-1 bg-zinc-800" />
        </div>

        {/* Continue with Google */}
        <button
          onClick={async () => {
            setGoogleLoading(true);
            await signIn('google', { callbackUrl: '/dashboard' });
          }}
          disabled={googleLoading}
          className="w-full py-3 bg-[#1c1c1e] hover:bg-zinc-800 border border-zinc-800 text-white rounded-full transition-all active:scale-98 flex items-center justify-center gap-3 text-sm"
        >
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>
      </div>

      {/* ── SHEET 3: SIGN UP SHEET ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'signUp' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar back button */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => triggerSheetTransition('welcome')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
            title="Back"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-12 h-1 bg-[#27272a] rounded-full" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <input
            type="email"
            placeholder="Email Address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md mt-2"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <div className="flex items-center gap-3 text-zinc-600 text-xs my-4">
          <div className="h-[1px] flex-1 bg-zinc-800" />
          <span>or</span>
          <div className="h-[1px] flex-1 bg-zinc-800" />
        </div>

        {/* Continue with Google for Sign Up (Matches Sign In Height) */}
        <button
          onClick={async () => {
            setGoogleLoading(true);
            await signIn('google', { callbackUrl: '/dashboard' });
          }}
          disabled={googleLoading}
          className="w-full py-3 bg-[#1c1c1e] hover:bg-zinc-800 border border-zinc-800 text-white rounded-full transition-all active:scale-98 flex items-center justify-center gap-3 text-sm"
        >
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>
      </div>

      {/* ── SHEET 4: FORGOT PASSWORD ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'forgotPassword' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => triggerSheetTransition('signIn')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
            title="Back"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-12 h-1 bg-[#27272a] rounded-full" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSendResetCode} className="space-y-3">
          <input
            type="email"
            placeholder="Email Address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md mt-2"
          >
            {loading ? 'Sending Code...' : 'Send Reset Code'}
          </button>
        </form>
      </div>

      {/* ── SHEET 5: VERIFY RESET CODE (OTP) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'verifyReset' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => triggerSheetTransition('forgotPassword')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
            title="Back"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-12 h-1 bg-[#27272a] rounded-full" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleVerifyResetCode} className="space-y-6">
          <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                value={digit}
                onChange={(e) => handleOtpChange(i, e)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-10 h-10 text-center text-lg font-bold bg-[#1c1c1e] text-white border border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-500 transition-colors caret-transparent"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || otp.join('').length < 6}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
          </button>
        </div>
      </div>

      {/* ── SHEET 6: RESET PASSWORD ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'resetPassword' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="w-10" />
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-3">
          <input
            type="password"
            placeholder="New Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <input
            type="password"
            placeholder="Confirm New Password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md mt-2"
          >
            {loading ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>
      </div>

      {/* ── SHEET 7: SIGN UP EMAIL VERIFICATION (OTP) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'verify' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => triggerSheetTransition('signUp')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1c1c1e] hover:bg-zinc-800 border border-[#1e1e21] text-white transition-colors"
            title="Back"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-12 h-1 bg-[#27272a] rounded-full" />
          <div className="w-10" />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4">
            {info}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                value={digit}
                onChange={(e) => handleOtpChange(i, e)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-10 h-10 text-center text-lg font-bold bg-[#1c1c1e] text-white border border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-500 transition-colors caret-transparent"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || otp.join('').length < 6}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
          </button>
        </div>
      </div>

      {/* ── SHEET 8: SUCCESS SHEET ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'success' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

        <div className="flex flex-col items-center text-center space-y-4 mb-6">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400">
            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Verified!</h2>
          <p className="text-sm text-zinc-400">
            Your email has been verified and your secure account is ready.
          </p>
        </div>

        <button
          onClick={() => {
            router.push('/dashboard');
            router.refresh();
          }}
          className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
        >
          Continue to Dashboard
        </button>
      </div>

      {/* Safe interactive backdrop to dismiss open sheets */}
      <div 
        onClick={() => {
          if (activeSheet === 'signIn' || activeSheet === 'signUp' || activeSheet === 'forgotPassword') {
            triggerSheetTransition('welcome');
          }
        }}
        className={`absolute inset-0 bg-black/25 z-30 transition-opacity duration-500 ${
          activeSheet !== 'welcome' && activeSheet !== 'none' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
    </div>
  );
}
