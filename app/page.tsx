'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardPage from './dashboard/page';
import { DeviceAccountStore } from '@/lib/deviceAccountStore';

const GrainGradient = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
  { ssr: false }
);

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

const getApiUrl = (path: string): string => {
  if (typeof window !== 'undefined') {
    const isNative = 
      (window as any).Capacitor ||
      window.location.origin.includes('capacitor://') || 
      window.location.protocol === 'file:' ||
      (window.location.hostname === 'localhost' && !window.location.port);
    if (isNative) {
      return `https://myconnectapp.vercel.app${path}`;
    }
  }
  return path;
};

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
  const [phone, setPhone] = useState('');


  // OTP state
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpValue, setOtpValue] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateOtpValue = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setOtpValue(clean);
    const arr = ['', '', '', '', '', ''];
    clean.split('').forEach((d, idx) => { arr[idx] = d; });
    setOtp(arr);
  };

  // UI state
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [successUser, setSuccessUser] = useState<SuccessUser | null>(null);
  const [showMobilePassword, setShowMobilePassword] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Track active session state in localStorage to eliminate mobile sign-in page flash on app open
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

  // Handle initial load status
  useEffect(() => {
    if (sessStatus !== 'loading') {
      setInitialLoading(false);
    }
  }, [sessStatus]);

  // Remove automatic redirect to prevent jitter; we now render DashboardPage directly below.

  // Load sheet state from query parameter on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const sheet = searchParams.get('sheet') as SheetState;
      if (sheet && ['welcome', 'signIn', 'signUp', 'forgotPassword', 'verifyReset', 'resetPassword', 'verify', 'success', 'none'].includes(sheet)) {
        setActiveSheet(sheet);
        setTargetSheet(sheet);
      }
    }
  }, []);

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

  // OTP handlers — clean, reliable single-digit auto-advance
  const handleOtpChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits
    const raw = e.target.value.replace(/\D/g, '');

    // If empty (e.g. delete key on mobile), clear and stay
    if (!raw) {
      const next = [...otp];
      next[i] = '';
      setOtp(next);
      return;
    }

    // Take only the last digit typed (handles keyboards that buffer)
    const digit = raw[raw.length - 1];
    const next = [...otp];
    next[i] = digit;
    setOtp(next);

    // Auto-advance to the next box
    if (i < 5) {
      requestAnimationFrame(() => otpRefs.current[i + 1]?.focus());
    }
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[i]) {
        const next = [...otp];
        next[i] = '';
        setOtp(next);
      } else if (i > 0) {
        const next = [...otp];
        next[i - 1] = '';
        setOtp(next);
        otpRefs.current[i - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      otpRefs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && i < 5) {
      otpRefs.current[i + 1]?.focus();
      e.preventDefault();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length > 0) {
      const digits = text.split('');
      const next: string[] = ['', '', '', '', '', ''];
      digits.forEach((d, idx) => { next[idx] = d; });
      setOtp(next);
      const focusIdx = Math.min(digits.length, 5);
      requestAnimationFrame(() => otpRefs.current[focusIdx]?.focus());
    }
    e.preventDefault();
  };

  // SMS one-time-code autofill (Capacitor / Android)
  const handleOtpAutoFill = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length >= 6) {
      const digits = raw.slice(0, 6).split('');
      const next: string[] = ['', '', '', '', '', ''];
      digits.forEach((d, idx) => { next[idx] = d; });
      setOtp(next);
      requestAnimationFrame(() => otpRefs.current[5]?.focus());
      e.preventDefault();
    }
  };

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await signIn('credentials', { redirect: false, email, password });
      if (res?.error === 'EMAIL_NOT_VERIFIED') {
        // Navigate to verify screen — do NOT auto-resend, it would overwrite the original OTP
        updateOtpValue('');
        triggerSheetTransition('verify');
        setInfo('Please verify your email using the code we sent when you signed up.');
        setLoading(false);
      } else if (res?.error) {
        setError('Invalid email or password. Please try again.');
        setLoading(false);
      } else if (res?.ok) {
        // ── RULE 1: Register account immediately on first successful login ──
        // We must fetch the updated session to get the userId from the backend.
        // We use a small delay + window.__NEXT_DATA__ approach: just store
        // what we know right now and let dashboard mount complete the upsert.
        try {
          const cleanEmail = email.toLowerCase().trim();
          // Store a temporary pre-session record so the account appears immediately
          // even before the NextAuth session propagates. The dashboard will do a
          // full upsert with the real userId once the session is available.
          const tempMeta = {
            userId: `pending_${cleanEmail}`,
            email: cleanEmail,
            username: cleanEmail.split('@')[0],
            displayName: cleanEmail.split('@')[0],
            profilePicture: '',
            provider: 'credentials' as const,
          };
          await DeviceAccountStore.addOrUpdateAccount(tempMeta, true);
        } catch (e) {}

        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Sign in failed. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[LOGIN_ERROR]', err);
      setError('Connection error. Please check your network and try again.');
      setLoading(false);
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
        body: JSON.stringify({ username, email, password, phone: phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Registration failed.');
        setLoading(false);
      } else {
        updateOtpValue('');
        setInfo('');
        setResendCooldown(60);
        triggerSheetTransition('verify');
        setLoading(false);
      }
    } catch (err: any) {
      setError('Signup failed. Please check your connection and try again.');
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
        // OTP verified — sign in immediately
        const signInRes = await signIn('credentials', { redirect: false, email, password });
        setLoading(false);
        if (signInRes?.ok) {
          // ── RULE 1: Register new account immediately after OTP verification ──
          try {
            const cleanEmail = email.toLowerCase().trim();
            const tempMeta = {
              userId: `pending_${cleanEmail}`,
              email: cleanEmail,
              username: username || cleanEmail.split('@')[0],
              displayName: username || cleanEmail.split('@')[0],
              profilePicture: '',
              provider: 'credentials' as const,
            };
            await DeviceAccountStore.addOrUpdateAccount(tempMeta, true);
          } catch (e) {}

          setSuccessUser({ email, username });
          triggerSheetTransition('success');
        } else {
          // Verified but auto-login failed — send them to sign-in
          setError('');
          setInfo('Email verified! Please sign in.');
          triggerSheetTransition('signIn');
        }
      }
    } catch (err: any) {
      setError('Verification failed. Please check your connection.');
      setLoading(false);
    }
  };

  // ── Forgot Password OTP flows ─────────────────────────────────────────────
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    setInfo('');
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
        updateOtpValue('');
        setInfo(data.message || 'Reset code sent to ' + email);
        triggerSheetTransition('verifyReset');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
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
    }, 300);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const code = otp.join('');
    if (code.length < 6) {
      setError('Invalid or missing verification code.');
      return;
    }
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
        setInfo('Password reset successfully! Please sign in.');
        setPassword('');
        setConfirmPassword('');
        triggerSheetTransition('signIn');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setInfo('Sending new code...');
    try {
      const endpoint = activeSheet === 'verifyReset' ? '/api/forgot-password' : '/api/resend-code';
      const res = await fetch(endpoint, {
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
        updateOtpValue('');
      } else {
        setError(data.message || 'Failed to resend.');
        setInfo('');
      }
    } catch {
      setError('Connection error. Please try again.');
      setInfo('');
    }
  };

  // Helper for verified initials
  const getInitials = (u: SuccessUser) => {
    if (u.username) return u.username.slice(0, 2).toUpperCase();
    return u.email.slice(0, 2).toUpperCase();
  };

  // Left panel with grain gradient
  const renderLeft = () => {
    if (activeSheet === 'success' && successUser) {
      return (
        <div className="relative overflow-hidden hidden lg:flex flex-col items-end justify-end h-full" style={{ background: 'linear-gradient(145deg, hsl(25,95%,55%), hsl(38,100%,65%), hsl(15,90%,45%))' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.08\'/%3E%3C/svg%3E")', backgroundSize: 'cover', opacity: 0.5 }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.3)' }}>
              <span style={{ fontSize: 28, color: 'white', fontWeight: 700 }}>✓</span>
            </div>
            <p className="text-white font-semibold text-2xl tracking-tight">You&apos;re verified!</p>
            <p className="text-white/70 text-base font-light">Welcome to the platform</p>
          </div>
          <div style={{ position: 'relative', zIndex: 10, width: '100%', padding: '24px 32px', background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 16 }}>
            {successUser.image ? (
              <img src={successUser.image} alt="Profile" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontWeight: 700, fontSize: 18 }}>{getInitials(successUser)}</span>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: 'white', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{successUser.username || successUser.email.split('@')[0]}</p>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{successUser.email}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative overflow-hidden hidden lg:flex flex-col items-center justify-center h-full">
        <GrainGradient
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          colorBack="#F8F9FA"
          softness={0.5}
          intensity={0.8}
          noise={0.06}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={0.8}
          rotation={0}
          speed={0.5}
        />
        <div className="relative z-10 flex flex-col items-center justify-center gap-6 px-12 text-center">
          <p
            className="text-gray-900 font-light lg:tracking-[0.4em] uppercase text-sm lg:[writing-mode:vertical-rl] lg:rotate-180"
            style={{ letterSpacing: '0.45em', opacity: 0.75 }}
          >
            Imagination is the limit
          </p>
        </div>
      </div>
    );
  };

  const renderDesktopRight = () => {
    // Determine the view inside desktop card
    const view = activeSheet === 'welcome' ? 'signIn' : activeSheet;

    if (view === 'verify' || view === 'verifyReset') {
      const isReset = view === 'verifyReset';
      return (
        <div className="flex flex-col items-center justify-center p-6 h-full overflow-y-auto bg-white">
          <div className="w-full max-w-[380px] space-y-5 py-2 text-center">
            <div>
              <h1 className="text-[28px] lg:text-[32px] font-normal tracking-tight text-gray-900">Check your inbox</h1>
              <p className="text-[13px] lg:text-[14px] text-gray-500 mt-1">We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span></p>
            </div>
            {error && <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</div>}
            {info && !error && <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">{info}</div>}
            <form onSubmit={isReset ? handleVerifyResetCode : handleVerify} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] lg:text-[13px] font-normal text-gray-700">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={otpValue}
                  onChange={(e) => updateOtpValue(e.target.value)}
                  className="w-full h-[48px] lg:h-[52px] text-center font-mono text-lg lg:text-xl font-bold tracking-[0.2em] pl-[0.2em] leading-none placeholder:tracking-normal placeholder:font-sans placeholder:text-gray-400 border border-gray-200 rounded-2xl bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-400 transition-all flex items-center justify-center"
                />
              </div>
              <button type="submit" disabled={loading || otpValue.length < 6} className="w-full h-[44px] lg:h-[48px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
            <div className="flex flex-col items-center gap-2 pt-1">
              <button type="button" onClick={handleResend} disabled={resendCooldown > 0} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors disabled:cursor-not-allowed">
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button type="button" onClick={() => { triggerSheetTransition(isReset ? 'forgotPassword' : 'signUp'); setError(''); setInfo(''); }} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors">← Back</button>
            </div>
          </div>
        </div>
      );
    }

    if (view === 'success' && successUser) {
      return (
        <div className="flex flex-col items-center justify-center p-6 h-full overflow-y-auto bg-white">
          <div className="w-full max-w-[380px] space-y-5 py-2 text-center">
            <div>
              <h1 className="text-[28px] lg:text-[32px] font-normal tracking-tight text-gray-900">You&apos;re in!</h1>
              <p className="text-[13px] lg:text-[14px] text-gray-500 mt-1">Your email has been verified and your account is ready.</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center gap-4 text-left">
              {successUser.image ? (
                <img src={successUser.image} alt="Profile" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white font-medium text-lg flex-shrink-0">
                  {getInitials(successUser)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-gray-900 truncate">{successUser.username || successUser.email.split('@')[0]}</p>
                <p className="text-[12px] text-gray-500 truncate">{successUser.email}</p>
              </div>
            </div>
            <button type="button" onClick={() => { router.push('/dashboard'); router.refresh(); }} className="w-full h-[46px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors">Continue to app</button>
          </div>
        </div>
      );
    }

    if (view === 'forgotPassword') {
      return (
        <div className="flex flex-col items-center justify-center p-6 h-full overflow-y-auto bg-white">
          <div className="w-full max-w-[380px] space-y-5 py-2 text-center">
            <div>
              <h1 className="text-[28px] lg:text-[32px] font-normal tracking-tight text-gray-900">Forgot Password</h1>
              <p className="text-[13px] lg:text-[14px] text-gray-500 mt-1">Enter your email to receive a recovery code.</p>
            </div>
            {error && <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</div>}
            {info && !error && <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">{info}</div>}
            <form onSubmit={handleSendResetCode} className="space-y-4 text-left">
              <div className="space-y-1">
                <label htmlFor="reset-email" className="text-[12px] lg:text-[13px] font-normal text-gray-700">Email</label>
                <input id="reset-email" type="email" required placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-[44px] lg:h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[13px] lg:text-[14px] text-gray-900 placeholder:text-gray-400" />
              </div>
              <button type="submit" disabled={loading} className="w-full h-[44px] lg:h-[46px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{loading ? 'Sending...' : 'Send Reset Code'}</button>
            </form>
            <div className="text-center pt-1">
              <button type="button" onClick={() => { triggerSheetTransition('signIn'); setError(''); }} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors">Back to Sign In</button>
            </div>
          </div>
        </div>
      );
    }

    if (view === 'resetPassword') {
      return (
        <div className="flex flex-col items-center justify-center p-6 h-full overflow-y-auto bg-white">
          <div className="w-full max-w-[380px] space-y-5 py-2 text-center">
            <div>
              <h1 className="text-[28px] lg:text-[32px] font-normal tracking-tight text-gray-900">Set New Password</h1>
              <p className="text-[13px] lg:text-[14px] text-gray-500 mt-1">Create a strong new password to secure your account.</p>
            </div>
            {error && <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</div>}
            <form onSubmit={handleResetPassword} className="space-y-3.5 text-left">
              <div className="space-y-1">
                <label htmlFor="new-password" className="text-[12px] lg:text-[13px] font-normal text-gray-700">New Password</label>
                <input id="new-password" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-[44px] lg:h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[13px] lg:text-[14px] text-gray-900 placeholder:text-gray-400" />
              </div>
              <div className="space-y-1">
                <label htmlFor="confirm-new-password" className="text-[12px] lg:text-[13px] font-normal text-gray-700">Confirm Password</label>
                <input id="confirm-new-password" type="password" required placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full h-[44px] lg:h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[13px] lg:text-[14px] text-gray-900 placeholder:text-gray-400" />
              </div>
              <button type="submit" disabled={loading} className="w-full h-[44px] lg:h-[46px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">{loading ? 'Saving...' : 'Reset Password'}</button>
            </form>
          </div>
        </div>
      );
    }

    const isLogin = view === 'signIn';
    return (
      <div className="flex flex-col items-center justify-center p-6 h-full overflow-y-auto bg-white">
        <div className={`w-full max-w-[380px] ${isLogin ? 'space-y-3 lg:space-y-4' : 'space-y-2 lg:space-y-3'} py-1 text-left`}>
          <div className="space-y-0.5">
            <h1 className={`${isLogin ? 'text-[24px] lg:text-[28px] xl:text-[32px]' : 'text-[20px] lg:text-[24px] xl:text-[28px]'} font-normal tracking-tight text-gray-900`}>
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className={`${isLogin ? 'text-[12px] lg:text-[13px] xl:text-[14px]' : 'text-[11px] lg:text-[12px] xl:text-[13px]'} text-gray-500`}>
              {isLogin ? "Let's sign you into your Connect account." : 'Create an account to start chatting.'}
            </p>
          </div>
          {error && <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">{error}</div>}
          <div className={`space-y-2 ${isLogin ? 'lg:space-y-3' : 'lg:space-y-2'}`}>
            <form onSubmit={isLogin ? handleLogin : handleSignup} className={`space-y-2 ${isLogin ? 'lg:space-y-3' : 'lg:space-y-2.5'}`}>
              {!isLogin && (
                <div className="space-y-0.5">
                  <label htmlFor="desktop-username" className="text-[11px] lg:text-[12px] font-normal text-gray-700">Username</label>
                  <input id="desktop-username" type="text" required placeholder="johndoe" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full h-[38px] lg:h-[42px] px-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[12px] lg:text-[13px] text-gray-900 placeholder:text-gray-400" />
                </div>
              )}
              <div className="space-y-0.5">
                <label htmlFor="desktop-email" className={`text-[11px] ${isLogin ? 'lg:text-[13px]' : 'lg:text-[12px]'} font-normal text-gray-700`}>Email</label>
                <input id="desktop-email" type="email" required placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full ${isLogin ? 'h-[42px] lg:h-[46px] px-4 text-[13px] lg:text-[14px]' : 'h-[38px] lg:h-[42px] px-3.5 text-[12px] lg:text-[13px]'} bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-gray-900 placeholder:text-gray-400`} />
              </div>
              {!isLogin && (
                <div className="space-y-0.5">
                  <label htmlFor="desktop-phone" className="text-[11px] lg:text-[12px] font-normal text-gray-700">Phone Number</label>
                  <input id="desktop-phone" type="tel" required placeholder="+92 300 0000000" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-[38px] lg:h-[42px] px-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[12px] lg:text-[13px] text-gray-900 placeholder:text-gray-400" />
                </div>
              )}
              <div className="space-y-0.5">
                <label htmlFor="desktop-password" className={`text-[11px] ${isLogin ? 'lg:text-[13px]' : 'lg:text-[12px]'} font-normal text-gray-700`}>Password</label>
                <input id="desktop-password" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full ${isLogin ? 'h-[42px] lg:h-[46px] px-4 text-[13px] lg:text-[14px]' : 'h-[38px] lg:h-[42px] px-3.5 text-[12px] lg:text-[13px]'} bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-gray-900 placeholder:text-gray-400`} />
              </div>
              {isLogin && (
                <div className="text-right">
                  <span onClick={() => triggerSheetTransition('forgotPassword')} className="text-xs text-zinc-500 hover:text-gray-900 transition-colors cursor-pointer">Forgot Password?</span>
                </div>
              )}
              <button type="submit" disabled={loading} className={`w-full ${isLogin ? 'h-[42px] lg:h-[46px] text-[13px] lg:text-[14px]' : 'h-[38px] lg:h-[42px] text-[12px] lg:text-[13px]'} bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${isLogin ? '' : 'mt-1'}`}>{loading ? 'Processing...' : isLogin ? 'Sign in' : 'Create account'}</button>
            </form>
            <div className="text-center pt-0.5">
              <button type="button" onClick={() => { triggerSheetTransition(isLogin ? 'signUp' : 'signIn'); setError(''); }} className={`text-[12px] ${isLogin ? 'lg:text-[13px]' : 'lg:text-[12px]'} font-normal text-gray-500 hover:text-gray-900 transition-colors`}>{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render the real DashboardPage instantly to avoid any route transition lag or jitter.
  // The DashboardPage itself will handle its own graceful loading state or display instantly.
  if (!hasMounted) {
    return null;
  }

  const isLikelyLoggedIn = (() => {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem('has_active_session') === 'true') return true;
      if (localStorage.getItem('last_logged_user')) return true;
      const stored = localStorage.getItem('connected_accounts');
      if (stored && JSON.parse(stored).length > 0) return true;
      return false;
    } catch { return false; }
  })();

  const hasExplicitSheetQuery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sheet');

  if ((sessStatus === 'authenticated' || (sessStatus === 'loading' && isLikelyLoggedIn)) && !hasExplicitSheetQuery) {
    return <DashboardPage />;
  }

  if (sessStatus === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0c0c0e] flex flex-col items-center justify-center font-sans">
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center shadow-2xl animate-pulse">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile viewport layout (under lg: breakpoint) */}
      <div className="lg:hidden relative h-screen w-full bg-white flex flex-col justify-between overflow-hidden select-none font-sans">
        
        {/* Elegant Centered Brand Block (only visible in Welcome sheet) */}
        <div 
          className={`absolute inset-x-0 top-[20vh] flex flex-col items-center justify-center text-center px-4 outline-none focus:outline-none transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
            activeSheet === 'welcome' 
              ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
              : 'opacity-0 scale-75 -translate-y-12 pointer-events-none'
          }`}
        >
          <img 
            src="/logo.png" 
            alt="Connect Logo" 
            className="w-16 h-16 object-contain rounded-2xl mb-4 shadow-sm bg-black outline-none focus:outline-none border-none"
          />
          <h1 className="text-4xl font-extrabold tracking-widest text-[#121214] uppercase outline-none focus:outline-none select-none">
            Connect
          </h1>
          <p className="text-xs tracking-[0.2em] font-medium text-zinc-500 uppercase mt-2 outline-none select-none">
            A Chatting App
          </p>
        </div>

        {/* Dynamic Top Left Header Block (visible on Sign In, Sign Up, etc.) */}
        <div 
          className={`absolute top-[calc(8vh+env(safe-area-inset-top,0px))] left-8 right-8 text-left z-10 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
            activeSheet !== 'welcome' && activeSheet !== 'none'
              ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' 
              : 'opacity-0 -translate-x-8 scale-95 pointer-events-none'
          }`}
        >
          <h1 className="text-5xl font-extrabold tracking-tight text-[#121214] sm:text-[3.25rem]">
            {headerContent.title}
          </h1>
          <p className="text-[0.95rem] text-zinc-500 font-medium tracking-wide mt-4 leading-relaxed max-w-sm">
            {headerContent.subtitle}
          </p>
        </div>

        {/* ── SHEET 1: WELCOME SHEET (Full width on bottom, taller pb-12 height) ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
            activeSheet === 'welcome' 
              ? 'translate-y-0 opacity-100 pointer-events-auto' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

          <div className="flex flex-col gap-3">
            <button
              onClick={() => triggerSheetTransition('signIn')}
              className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
            >
              Sign In
            </button>
            
            <button
              onClick={() => triggerSheetTransition('signUp')}
              className="w-full bg-[#1c1c1e] text-white hover:bg-zinc-800 border border-zinc-800 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm"
            >
              Create Account
            </button>
          </div>
        </div>

        {/* ── SHEET 2: SIGN IN SHEET (Full width on bottom, taller pb-12 height) ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
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

            <div className="relative">
              <input
                type={showMobilePassword ? 'text' : 'password'}
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 pr-12 focus:outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowMobilePassword(!showMobilePassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showMobilePassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 113.682 3.682M21 12a9.96 9.96 0 01-1.557 3.018m-3.437-1.42A3 3 0 0012 10.012c-.29 0-.57.04-.833.115M17.657 16.657L13.414 12.414m0 0L9 7.999M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

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
        </div>

        {/* ── SHEET 3: SIGN UP SHEET ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
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
              type="tel"
              placeholder="+92 300 0000000"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 focus:outline-none transition-colors text-sm"
            />

            <div className="relative">
              <input
                type={showMobilePassword ? 'text' : 'password'}
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-full bg-[#1c1c1e] text-white placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 py-3 pr-12 focus:outline-none transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowMobilePassword(!showMobilePassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showMobilePassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 113.682 3.682M21 12a9.96 9.96 0 01-1.557 3.018m-3.437-1.42A3 3 0 0012 10.012c-.29 0-.57.04-.833.115M17.657 16.657L13.414 12.414m0 0L9 7.999M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md mt-2"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        </div>

        {/* ── SHEET 4: FORGOT PASSWORD ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
            activeSheet === 'forgotPassword' 
              ? 'translate-y-0 opacity-100 pointer-events-auto' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          {/* Top bar back button */}
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
          {info && !error && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4">
              {info}
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

        {/* ── SHEET 5: VERIFY RESET CODE ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
            activeSheet === 'verifyReset' 
              ? 'translate-y-0 opacity-100 pointer-events-auto' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          {/* Top bar back button */}
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
          {info && !error && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4">
              {info}
            </div>
          )}

          <form onSubmit={handleVerifyResetCode} className="space-y-4">
            <div className="mb-4">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                value={otpValue}
                onChange={(e) => updateOtpValue(e.target.value)}
                className="w-full h-[50px] rounded-full bg-[#1c1c1e] text-white text-center font-mono text-lg font-bold tracking-[0.2em] pl-[0.2em] leading-none placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 focus:outline-none transition-all flex items-center justify-center"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpValue.length < 6}
              className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>

          <div className="text-center mt-2">
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

        {/* ── SHEET 6: SET NEW PASSWORD ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
            activeSheet === 'resetPassword' 
              ? 'translate-y-0 opacity-100 pointer-events-auto' 
              : 'translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-12 h-1 bg-[#27272a] rounded-full mx-auto mb-6" />

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
            {loading ? 'Saving...' : 'Reset Password'}
          </button>
        </form>
      </div>

      {/* ── SHEET 7: VERIFY EMAIL (OTP FLOW) ── */}
      <div
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
          activeSheet === 'verify' 
            ? 'translate-y-0 opacity-100 pointer-events-auto' 
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar back button */}
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

        <form onSubmit={handleVerify} className="space-y-4">
          <div className="mb-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="Enter 6-digit code"
              value={otpValue}
              onChange={(e) => updateOtpValue(e.target.value)}
              className="w-full h-[50px] rounded-full bg-[#1c1c1e] text-white text-center font-mono text-lg font-bold tracking-[0.2em] pl-[0.2em] leading-none placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-500 border border-zinc-800 focus:border-zinc-500 px-5 focus:outline-none transition-all flex items-center justify-center"
            />
          </div>

          <button
            type="submit"
            disabled={loading || otpValue.length < 6}
            className="w-full bg-white text-black hover:bg-zinc-200 transition-all active:scale-98 rounded-full py-3.5 font-bold text-center text-sm shadow-md"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>
        </form>

        <div className="text-center mt-2">
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
        className={`fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto z-40 bg-[#121214] border-t border-[#1e1e21] rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-15px_40px_rgba(0,0,0,0.25)] max-h-[90vh] overflow-y-auto no-scrollbar transform transition-all duration-500 cubic-bezier(0.25,1,0.5,1) ${
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

      <div className="hidden lg:flex h-screen w-full items-center justify-center overflow-hidden bg-[#F4F4F4] py-[0.25in] px-6 md:px-12 select-none font-sans">
        <div 
          className="w-full max-w-[960px] rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_-10px_rgba(0,0,0,0.4)] bg-white border border-gray-100 flex flex-col lg:grid lg:grid-cols-2" 
          style={{ 
            position: 'relative', 
            zIndex: 1,
            height: 'min(680px, calc(100vh - 0.5in))',
          }}
        >
          {renderLeft()}
          <div className="h-full bg-white overflow-hidden">
            {renderDesktopRight()}
          </div>
        </div>
      </div>
    </>
  );
}
