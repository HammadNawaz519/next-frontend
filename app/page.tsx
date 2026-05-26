'use client';

import { signIn } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GrainGradient } from '@paper-design/shaders-react';

type AuthView = 'login' | 'signup' | 'verify' | 'success';

interface SuccessUser {
  email: string;
  username?: string;
  image?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<AuthView>('login');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // OTP input handler
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
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
      setView('verify');
      setInfo('Your email isn\'t verified yet. We\'ve sent a new code.');
      // Auto-resend code
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
        setView('verify');
        setLoading(false);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
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
        // Auto sign-in after verification
        const signInRes = await signIn('credentials', { redirect: false, email, password });
        setLoading(false);
        if (signInRes?.ok) {
          setSuccessUser({ email, username });
          setView('success');
        } else {
          setError('Verified! Please sign in to continue.');
          setView('login');
        }
      }
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
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

  // ── Avatar helpers ────────────────────────────────────────────────────────
  const getInitials = (u: SuccessUser) => {
    if (u.username) return u.username.slice(0, 2).toUpperCase();
    return u.email.slice(0, 2).toUpperCase();
  };

  // ── Left panel ────────────────────────────────────────────────────────────
  const renderLeft = () => {
    if (view === 'success' && successUser) {
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
          colors={['#FF7A00', '#007AFF', '#7ED9D9']}
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

  // ── Right panel ───────────────────────────────────────────────────────────
  const renderRight = () => {
    if (view === 'verify') {
      return (
        <div className="flex flex-col items-center justify-center p-6 md:p-12 lg:p-16 h-full overflow-y-auto">
          <div className="w-full max-w-[420px] space-y-6 py-6">
            <div className="text-left space-y-2">
              <h1 className="text-[32px] font-normal tracking-tight text-gray-900">Check your inbox</h1>
              <p className="text-[14px] text-gray-500 mt-1">We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span></p>
            </div>
            {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">{error}</div>}
            {info && !error && <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">{info}</div>}
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="space-y-2 mt-2">
                <label className="text-[13px] font-normal text-gray-700">Verification code</label>
                <div className="flex gap-3" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i} ref={(el) => { otpRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-full h-[54px] text-center text-xl font-medium border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-gray-900"
                    />
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading || otp.join('').length < 6} className="w-full h-[48px] mt-2 bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Verifying...' : 'Verify email'}
              </button>
            </form>
            <div className="text-center pt-4">
              <button type="button" onClick={handleResend} disabled={resendCooldown > 0} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors disabled:cursor-not-allowed">
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
            <div className="text-center">
              <button type="button" onClick={() => { setView('signup'); setError(''); setInfo(''); }} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors">← Back to sign up</button>
            </div>
          </div>
        </div>
      );
    }

    if (view === 'success' && successUser) {
      return (
        <div className="flex flex-col items-center justify-center p-6 md:p-12 lg:p-16 h-full overflow-y-auto">
          <div className="w-full max-w-[420px] space-y-6 py-6">
            <div className="text-left space-y-2">
              <h1 className="text-[32px] font-normal tracking-tight text-gray-900">You&apos;re in!</h1>
              <p className="text-[14px] text-gray-500 mt-1">Your email has been verified and your account is ready.</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center gap-4 mt-2 mb-2">
              {successUser.image ? (
                <img src={successUser.image} alt="Profile" className="w-14 h-14 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white font-medium text-xl">{getInitials(successUser)}</div>
              )}
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-gray-900 truncate">{successUser.username || successUser.email.split('@')[0]}</p>
                <p className="text-[13px] text-gray-500 truncate">{successUser.email}</p>
              </div>
            </div>
            <button type="button" onClick={() => { router.push('/dashboard'); router.refresh(); }} className="w-full h-[48px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors">Continue to app</button>
          </div>
        </div>
      );
    }

    const isLogin = view === 'login';
    return (
      <div className="flex flex-col items-center justify-center p-6 md:p-12 lg:p-16 h-full overflow-y-auto">

        {/* Mobile-only animated gradient header */}
        <div className="lg:hidden w-full relative rounded-3xl overflow-hidden mb-8 flex-shrink-0" style={{ height: '180px' }}>
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
            colors={['#FF7A00', '#007AFF', '#7ED9D9']}
          />
          <div className="relative z-10 h-full flex items-center justify-center">
            <p className="text-gray-800 font-light tracking-[0.5em] uppercase text-[10px]" style={{ opacity: 0.65 }}>
              Imagination is the limit
            </p>
          </div>
        </div>

        <div className="w-full max-w-[420px] space-y-6 py-4">
          <div className="text-left w-full space-y-2">
            <h1 className="text-[32px] font-normal tracking-tight text-gray-900">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
            <p className="text-[14px] text-gray-500">{isLogin ? 'Let\'s sign you into your Connect account.' : 'Create an account to start chatting.'}</p>
          </div>
          {error && <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">{error}</div>}
          <div className="space-y-4 md:space-y-5">
            <button type="button" disabled={googleLoading} onClick={async () => { setGoogleLoading(true); await signIn('google', { callbackUrl: '/dashboard' }); }} className="w-full h-[46px] flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 rounded-2xl font-normal text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {googleLoading ? 'Redirecting...' : isLogin ? 'Sign in with Google' : 'Sign up with Google'}
            </button>
            <div className="flex items-center gap-3 text-gray-400 text-sm"><div className="h-px flex-1 bg-gray-200" />or<div className="h-px flex-1 bg-gray-200" /></div>
            <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1">
                  <label htmlFor="username" className="text-[13px] font-normal text-gray-700">Username</label>
                  <input id="username" type="text" required placeholder="johndoe" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400" />
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="email" className="text-[13px] font-normal text-gray-700">Email</label>
                <input id="email" type="email" required placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400" />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-[13px] font-normal text-gray-700">Password</label>
                <input id="password" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-[46px] px-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400" />
              </div>
              <button type="submit" disabled={loading} className="w-full h-[46px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-2xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2">{loading ? 'Processing...' : isLogin ? 'Sign in' : 'Create account'}</button>
            </form>
            <div className="text-center pt-2">
              <button type="button" onClick={() => { setView(isLogin ? 'signup' : 'login'); setError(''); }} className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors">{isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full flex bg-white overflow-hidden">
      <div 
        className="w-full min-h-screen flex flex-col lg:grid lg:grid-cols-2 bg-white" 
        style={{ 
          position: 'relative', 
          zIndex: 1,
        }}
      >
        {renderLeft()}
        <div className="flex-1 flex flex-col justify-center overflow-y-auto bg-white min-h-screen">
            {renderRight()}
        </div>
      </div>
    </div>
  );
}
