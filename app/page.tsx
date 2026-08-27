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

  // ── SHARED COMPONENTS ────────────────────────────────────────────────────

  // Premium CONNECT input field
  const cnInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => {
    const { label, className, ...rest } = props;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(238,238,238,0.4)' }}>
            {label}
          </label>
        )}
        <input
          {...rest}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#EEEEEE',
            fontFamily: 'inherit',
            fontSize: 14,
            padding: '13px 16px',
            width: '100%',
            outline: 'none',
            boxSizing: 'border-box',
            ...props.style,
          }}
          onFocus={e => {
            (e.target as HTMLInputElement).style.borderColor = '#00ADB5';
            (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)';
          }}
          onBlur={e => {
            (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)';
            (e.target as HTMLInputElement).style.boxShadow = 'none';
          }}
        />
      </div>
    );
  };

  // Alert banner (error or info)
  const cnAlert = (msg: string, type: 'error' | 'info') => (
    <div style={{
      fontSize: 13,
      padding: '10px 14px',
      borderRadius: 10,
      background: type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(0,173,181,0.1)',
      border: `1px solid ${type === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(0,173,181,0.25)'}`,
      color: type === 'error' ? '#f87171' : '#00ADB5',
    }}>
      {msg}
    </div>
  );

  // Back button
  const cnBackBtn = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 36, height: 36,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#EEEEEE',
        cursor: 'pointer',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
    </button>
  );

  // Desktop left panel — CONNECT premium brand panel
  const renderLeft = () => {
    if (activeSheet === 'success' && successUser) {
      return (
        <div style={{
          position: 'relative', overflow: 'hidden',
          display: 'none',
          background: 'linear-gradient(145deg, #00ADB5, #007A80)',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 40px', gap: 24, textAlign: 'center',
        }} className="hidden lg:flex">
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            <svg width="32" height="32" fill="none" stroke="white" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 22, margin: 0 }}>You&apos;re in!</p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '8px 0 0' }}>Welcome to CONNECT</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: '#1c2028',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', gap: 32, textAlign: 'center',
      }} className="hidden lg:flex">
        {/* Ambient blobs */}
        <div className="cn-ambient-blob" />
        <div className="cn-ambient-blob" />

        {/* Branding */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #00ADB5, #007A80)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(0,173,181,0.3)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 style={{ color: '#EEEEEE', fontSize: 32, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              CONNECT
            </h1>
            <p style={{ color: 'rgba(238,238,238,0.45)', fontSize: 13, margin: '8px 0 0', letterSpacing: '0.05em' }}>
              Premium communication
            </p>
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 240 }}>
          {[
            { icon: '💬', text: 'Realtime messaging' },
            { icon: '📞', text: 'Voice & video calls' },
            { icon: '🔒', text: 'Private by design' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{ color: 'rgba(238,238,238,0.6)', fontSize: 13 }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Desktop right panel — all auth forms
  const renderDesktopRight = () => {
    const view = activeSheet === 'welcome' ? 'signIn' : activeSheet;

    const inputStyle: React.CSSProperties = {
      width: '100%',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      color: '#EEEEEE',
      fontFamily: 'inherit',
      fontSize: 14,
      padding: '13px 16px',
      outline: 'none',
      boxSizing: 'border-box',
    };

    const btnPrimary: React.CSSProperties = {
      width: '100%',
      background: '#00ADB5',
      color: '#ffffff',
      border: 'none',
      borderRadius: 12,
      fontFamily: 'inherit',
      fontSize: 15,
      fontWeight: 600,
      padding: '13px 24px',
      cursor: 'pointer',
      marginTop: 4,
    };

    const labelStyle: React.CSSProperties = {
      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'rgba(238,238,238,0.4)',
      display: 'block', marginBottom: 6,
    };

    const sharedPanel = (content: React.ReactNode) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 40px', height: '100%', overflowY: 'auto',
        background: '#222831',
      }}>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {content}
        </div>
      </div>
    );

    if (view === 'verify' || view === 'verifyReset') {
      const isReset = view === 'verifyReset';
      return sharedPanel(<>
        <div>
          <h1 style={{ color: '#EEEEEE', fontSize: 26, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>Check your inbox</h1>
          <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>
            We sent a 6-digit code to <strong style={{ color: '#EEEEEE' }}>{email}</strong>
          </p>
        </div>
        {error && cnAlert(error, 'error')}
        {info && !error && cnAlert(info, 'info')}
        <form onSubmit={isReset ? handleVerifyResetCode : handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Verification code</label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              autoComplete="one-time-code" placeholder="000000"
              value={otpValue} onChange={(e) => updateOtpValue(e.target.value)}
              style={{ ...inputStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: '0.3em' }}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <button type="submit" disabled={loading || otpValue.length < 6} style={{ ...btnPrimary, opacity: loading || otpValue.length < 6 ? 0.5 : 1 }}>
            {loading ? 'Verifying…' : 'Verify Code'}
          </button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
            style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'rgba(238,238,238,0.3)' : '#00ADB5', fontSize: 13, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
          </button>
          <button type="button" onClick={() => { triggerSheetTransition(isReset ? 'forgotPassword' : 'signUp'); setError(''); setInfo(''); }}
            style={{ background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Back
          </button>
        </div>
      </>);
    }

    if (view === 'success' && successUser) {
      return sharedPanel(<>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(0,173,181,0.1)',
            border: '1px solid rgba(0,173,181,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" fill="none" stroke="#00ADB5" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 style={{ color: '#EEEEEE', fontSize: 26, fontWeight: 700, margin: '0 0 8px' }}>You&apos;re in!</h1>
          <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>Your account is verified and ready.</p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#393E46', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEEEEE', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            {getInitials(successUser)}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#EEEEEE', fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{successUser.username || successUser.email.split('@')[0]}</p>
            <p style={{ color: 'rgba(238,238,238,0.4)', fontSize: 12, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{successUser.email}</p>
          </div>
        </div>
        <button onClick={() => router.push('/dashboard')} style={btnPrimary}>Continue to CONNECT</button>
      </>);
    }

    if (view === 'forgotPassword') {
      return sharedPanel(<>
        <div>
          <h1 style={{ color: '#EEEEEE', fontSize: 26, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>Forgot Password</h1>
          <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>Enter your email to receive a recovery code.</p>
        </div>
        {error && cnAlert(error, 'error')}
        {info && !error && cnAlert(info, 'info')}
        <form onSubmit={handleSendResetCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input id="reset-email" type="email" required placeholder="name@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? 'Sending…' : 'Send Reset Code'}</button>
        </form>
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={() => { triggerSheetTransition('signIn'); setError(''); }}
            style={{ background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Back to Sign In
          </button>
        </div>
      </>);
    }

    if (view === 'resetPassword') {
      return sharedPanel(<>
        <div>
          <h1 style={{ color: '#EEEEEE', fontSize: 26, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>Set New Password</h1>
          <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>Create a strong new password to secure your account.</p>
        </div>
        {error && cnAlert(error, 'error')}
        <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>New Password</label>
            <input id="new-password" type="password" required placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <label style={labelStyle}>Confirm Password</label>
            <input id="confirm-new-password" type="password" required placeholder="••••••••" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>{loading ? 'Saving…' : 'Reset Password'}</button>
        </form>
      </>);
    }

    const isLogin = view === 'signIn';
    return sharedPanel(<>
      <div>
        <h1 style={{ color: '#EEEEEE', fontSize: 26, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>
          {isLogin ? 'Welcome back' : 'Create account'}
        </h1>
        <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>
          {isLogin ? 'Sign into your CONNECT account.' : 'Start communicating with CONNECT.'}
        </p>
      </div>
      {error && cnAlert(error, 'error')}
      {info && !error && cnAlert(info, 'info')}
      <form onSubmit={isLogin ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isLogin && (
          <div>
            <label style={labelStyle}>Username</label>
            <input id="desktop-username" type="text" required placeholder="johndoe" value={username}
              onChange={(e) => setUsername(e.target.value)} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>Email Address</label>
          <input id="desktop-email" type="email" required placeholder="name@email.com" value={email}
            onChange={(e) => setEmail(e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
        {!isLogin && (
          <div>
            <label style={labelStyle}>Phone Number</label>
            <input id="desktop-phone" type="tel" required placeholder="+92 300 0000000" value={phone}
              onChange={(e) => setPhone(e.target.value)} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        )}
        <div>
          <label style={labelStyle}>Password</label>
          <input id="desktop-password" type="password" required placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} style={inputStyle}
            onFocus={e => { e.target.style.borderColor = '#00ADB5'; e.target.style.boxShadow = '0 0 0 3px rgba(0,173,181,0.15)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>
        {isLogin && (
          <div style={{ textAlign: 'right' }}>
            <span onClick={() => triggerSheetTransition('forgotPassword')}
              style={{ fontSize: 12, color: 'rgba(238,238,238,0.4)', cursor: 'pointer' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#00ADB5'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(238,238,238,0.4)'}
            >
              Forgot password?
            </span>
          </div>
        )}
        <button type="submit" disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Processing…' : isLogin ? 'Sign In' : 'Create Account'}
        </button>
      </form>
      <div style={{ textAlign: 'center' }}>
        <button type="button" onClick={() => { triggerSheetTransition(isLogin ? 'signUp' : 'signIn'); setError(''); }}
          style={{ background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          onMouseEnter={e => (e.target as HTMLElement).style.color = '#00ADB5'}
          onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(238,238,238,0.4)'}
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </>);
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Render the real DashboardPage instantly to avoid any route transition lag or jitter.
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

  if (sessStatus === 'authenticated' || (sessStatus === 'loading' && isLikelyLoggedIn)) {
    return <DashboardPage />;
  }

  if (sessStatus === 'loading') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#222831',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'linear-gradient(135deg, #00ADB5, #007A80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(0,173,181,0.3)',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
      </div>
    );
  }

  // ── MOBILE AUTH LAYOUT ────────────────────────────────────────────────────
  // Shared sheet style
  const sheetBase: React.CSSProperties = {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    maxWidth: 480, margin: '0 auto',
    zIndex: 40,
    background: '#1c2028',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '24px 24px 0 0',
    padding: '24px 24px calc(24px + env(safe-area-inset-bottom, 0px))',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
    fontFamily: "'Inter', sans-serif",
  };

  const sheetInputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    color: '#EEEEEE',
    fontFamily: 'inherit',
    fontSize: 15,
    padding: '14px 18px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const sheetBtn: React.CSSProperties = {
    width: '100%',
    background: '#00ADB5',
    color: '#ffffff',
    border: 'none',
    borderRadius: 14,
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 600,
    padding: '15px 24px',
    cursor: 'pointer',
  };

  const sheetBtnSecondary: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    color: '#EEEEEE',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 500,
    padding: '15px 24px',
    cursor: 'pointer',
  };

  const sheetDrag = (
    <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />
  );

  const sheetBack = (target: SheetState) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <button type="button" onClick={() => triggerSheetTransition(target)}
        style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#EEEEEE', cursor: 'pointer', outline: 'none' }}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>
      <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
      <div style={{ width: 36 }} />
    </div>
  );

  const errBanner = (msg: string) => msg ? (
    <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', marginBottom: 12 }}>{msg}</div>
  ) : null;

  const infoBanner = (msg: string) => msg ? (
    <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,173,181,0.1)', border: '1px solid rgba(0,173,181,0.25)', color: '#00ADB5', marginBottom: 12 }}>{msg}</div>
  ) : null;

  const sheetVisible = (s: SheetState): React.CSSProperties => ({
    ...sheetBase,
    transform: activeSheet === s ? 'translateY(0)' : 'translateY(100%)',
    opacity: activeSheet === s ? 1 : 0,
    pointerEvents: activeSheet === s ? 'auto' : 'none',
    transition: 'transform 350ms cubic-bezier(0.25,1,0.5,1), opacity 300ms ease',
  });

  return (
    <>
      {/* ── MOBILE AUTH LAYOUT (< lg) ── */}
      <div style={{
        position: 'relative', height: '100dvh', width: '100%',
        background: '#222831', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontFamily: "'Inter', sans-serif",
      }} className="lg:hidden">

        {/* Ambient accent blobs */}
        <div className="cn-ambient-blob" />
        <div className="cn-ambient-blob" />

        {/* Welcome brand block — visible only on welcome sheet */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          padding: '0 32px', gap: 20, zIndex: 1,
          transform: activeSheet === 'welcome' ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(-24px)',
          opacity: activeSheet === 'welcome' ? 1 : 0,
          pointerEvents: activeSheet === 'welcome' ? 'auto' : 'none',
          transition: 'all 400ms cubic-bezier(0.25,1,0.5,1)',
        }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, #00ADB5, #007A80)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 40px rgba(0,173,181,0.35)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 style={{ color: '#EEEEEE', fontSize: 36, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>CONNECT</h1>
            <p style={{ color: 'rgba(238,238,238,0.4)', fontSize: 14, margin: '8px 0 0', letterSpacing: '0.04em' }}>Premium communication</p>
          </div>
        </div>

        {/* Header above form sheets */}
        <div style={{
          position: 'absolute', top: 'calc(40px + env(safe-area-inset-top, 0px))',
          left: 28, right: 28, zIndex: 10,
          transform: activeSheet !== 'welcome' && activeSheet !== 'none' ? 'translateX(0)' : 'translateX(-24px)',
          opacity: activeSheet !== 'welcome' && activeSheet !== 'none' ? 1 : 0,
          pointerEvents: activeSheet !== 'welcome' && activeSheet !== 'none' ? 'auto' : 'none',
          transition: 'all 400ms cubic-bezier(0.25,1,0.5,1)',
        }}>
          <h1 style={{ color: '#EEEEEE', fontSize: 32, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
            {headerContent.title}
          </h1>
          <p style={{ color: 'rgba(238,238,238,0.45)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {headerContent.subtitle}
          </p>
        </div>

        {/* ── SHEET 1: WELCOME ── */}
        <div style={sheetVisible('welcome')}>
          {sheetDrag}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => triggerSheetTransition('signIn')} style={sheetBtn}>Sign In</button>
            <button onClick={() => triggerSheetTransition('signUp')} style={sheetBtnSecondary}>Create Account</button>
          </div>
        </div>

        {/* ── SHEET 2: SIGN IN ── */}
        <div style={sheetVisible('signIn')}>
          {sheetBack('welcome')}
          {errBanner(error)}
          {!error && infoBanner(info)}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <div style={{ position: 'relative' }}>
              <input type={showMobilePassword ? 'text' : 'password'} placeholder="Password" required value={password}
                onChange={e => setPassword(e.target.value)} style={{ ...sheetInputStyle, paddingRight: 48 }}
                onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
              <button type="button" onClick={() => setShowMobilePassword(!showMobilePassword)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', cursor: 'pointer', outline: 'none' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showMobilePassword
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 113.682 3.682M21 12a9.96 9.96 0 01-1.557 3.018M3 3l18 18" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                </svg>
              </button>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span onClick={() => triggerSheetTransition('forgotPassword')}
                style={{ fontSize: 13, color: 'rgba(238,238,238,0.4)', cursor: 'pointer' }}>
                Forgot password?
              </span>
            </div>
            <button type="submit" disabled={loading} style={{ ...sheetBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { triggerSheetTransition('signUp'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Don&apos;t have an account? <span style={{ color: '#00ADB5' }}>Sign up</span>
            </button>
          </div>
        </div>

        {/* ── SHEET 3: SIGN UP ── */}
        <div style={sheetVisible('signUp')}>
          {sheetBack('welcome')}
          {errBanner(error)}
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="Username" required value={username} onChange={e => setUsername(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <input type="tel" placeholder="+92 300 0000000" required value={phone} onChange={e => setPhone(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <div style={{ position: 'relative' }}>
              <input type={showMobilePassword ? 'text' : 'password'} placeholder="Password" required value={password}
                onChange={e => setPassword(e.target.value)} style={{ ...sheetInputStyle, paddingRight: 48 }}
                onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
              <button type="button" onClick={() => setShowMobilePassword(!showMobilePassword)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', cursor: 'pointer', outline: 'none' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showMobilePassword
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 113.682 3.682M21 12a9.96 9.96 0 01-1.557 3.018M3 3l18 18" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                </svg>
              </button>
            </div>
            <button type="submit" disabled={loading} style={{ ...sheetBtn, opacity: loading ? 0.6 : 1, marginTop: 4 }}>
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { triggerSheetTransition('signIn'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'rgba(238,238,238,0.4)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Already have an account? <span style={{ color: '#00ADB5' }}>Sign in</span>
            </button>
          </div>
        </div>

        {/* ── SHEET 4: FORGOT PASSWORD ── */}
        <div style={sheetVisible('forgotPassword')}>
          {sheetBack('signIn')}
          {errBanner(error)}
          {!error && infoBanner(info)}
          <form onSubmit={handleSendResetCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <button type="submit" disabled={loading} style={{ ...sheetBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Sending Code…' : 'Send Reset Code'}
            </button>
          </form>
        </div>

        {/* ── SHEET 5: VERIFY RESET CODE ── */}
        <div style={sheetVisible('verifyReset')}>
          {sheetBack('forgotPassword')}
          {errBanner(error)}
          {!error && infoBanner(info)}
          <form onSubmit={handleVerifyResetCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
              placeholder="Enter 6-digit code" value={otpValue} onChange={e => updateOtpValue(e.target.value)}
              style={{ ...sheetInputStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: '0.3em' }}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <button type="submit" disabled={loading || otpValue.length < 6}
              style={{ ...sheetBtn, opacity: loading || otpValue.length < 6 ? 0.5 : 1 }}>
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
              style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'rgba(238,238,238,0.3)' : '#00ADB5', fontSize: 13, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
            </button>
          </div>
        </div>

        {/* ── SHEET 6: SET NEW PASSWORD ── */}
        <div style={sheetVisible('resetPassword')}>
          {sheetDrag}
          {errBanner(error)}
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" placeholder="New Password" required value={password} onChange={e => setPassword(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <input type="password" placeholder="Confirm New Password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={sheetInputStyle}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <button type="submit" disabled={loading} style={{ ...sheetBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Saving…' : 'Reset Password'}
            </button>
          </form>
        </div>

        {/* ── SHEET 7: VERIFY EMAIL (OTP) ── */}
        <div style={sheetVisible('verify')}>
          {sheetBack('signUp')}
          {errBanner(error)}
          {!error && infoBanner(info)}
          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
              placeholder="Enter 6-digit code" value={otpValue} onChange={e => updateOtpValue(e.target.value)}
              style={{ ...sheetInputStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: '0.3em' }}
              onFocus={e => { e.target.style.borderColor = '#00ADB5'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }} />
            <button type="submit" disabled={loading || otpValue.length < 6}
              style={{ ...sheetBtn, opacity: loading || otpValue.length < 6 ? 0.5 : 1 }}>
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
              style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'rgba(238,238,238,0.3)' : '#00ADB5', fontSize: 13, cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
            </button>
          </div>
        </div>

        {/* ── SHEET 8: SUCCESS ── */}
        <div style={sheetVisible('success')}>
          {sheetDrag}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(0,173,181,0.1)', border: '1px solid rgba(0,173,181,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" fill="none" stroke="#00ADB5" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 style={{ color: '#EEEEEE', fontWeight: 700, fontSize: 22, margin: '0 0 6px' }}>Verified!</h2>
              <p style={{ color: 'rgba(238,238,238,0.5)', fontSize: 14, margin: 0 }}>
                Your email has been verified and your secure account is ready.
              </p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} style={sheetBtn}>
            Continue to CONNECT
          </button>
        </div>

        {/* Backdrop */}
        <div
          onClick={() => {
            if (activeSheet === 'signIn' || activeSheet === 'signUp' || activeSheet === 'forgotPassword') {
              triggerSheetTransition('welcome');
            }
          }}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 30,
            opacity: activeSheet !== 'welcome' && activeSheet !== 'none' ? 1 : 0,
            pointerEvents: activeSheet !== 'welcome' && activeSheet !== 'none' ? 'auto' : 'none',
            transition: 'opacity 300ms ease',
            backdropFilter: 'blur(2px)',
          }}
        />
      </div>

      {/* ── DESKTOP AUTH LAYOUT (>= lg) ── */}
      <div style={{
        display: 'none', height: '100vh', width: '100%',
        alignItems: 'center', justifyContent: 'center',
        background: '#1a1e25',
        fontFamily: "'Inter', sans-serif",
        padding: '24px',
      }} className="hidden lg:flex">
        <div style={{
          width: '100%', maxWidth: 900,
          borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          height: 'min(640px, calc(100vh - 48px))',
        }}>
          {renderLeft()}
          <div style={{ height: '100%', overflow: 'hidden' }}>
            {renderDesktopRight()}
          </div>
        </div>
      </div>
    </>
  );
}
