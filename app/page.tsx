'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GrainGradient } from '@paper-design/shaders-react';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isLogin) {
      const res = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });
      if (res?.error) {
        setError('Invalid email or password.');
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } else {
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
          const signInRes = await signIn('credentials', {
            redirect: false,
            email,
            password,
          });
          if (signInRes?.error) {
            setError(signInRes.error);
            setLoading(false);
          } else {
            router.push('/');
            router.refresh();
          }
        }
      } catch {
        setError('An error occurred.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="animated-bg h-screen w-full flex items-center justify-center overflow-hidden" style={{ padding: '24px 1.5rem' }}>
      <span className="blob3" aria-hidden="true" />
      <span className="blob4" aria-hidden="true" />
      <div className="w-full max-w-[960px] bg-white rounded-2xl md:rounded-[2rem] overflow-hidden" style={{ height: 'calc(100vh - 48px)', position: 'relative', zIndex: 1 }}>
        <div className="grid lg:grid-cols-2 gap-0 h-full">

          {/* ===== Left Side — Shader Gradient ===== */}
          <div className="relative lg:rounded-[2rem] m-0 lg:m-4 overflow-hidden hidden lg:flex flex-col items-center justify-center">
            <GrainGradient
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              colorBack="hsl(0, 0%, 0%)"
              softness={0.7}
              intensity={0.5}
              noise={0.08}
              shape="corners"
              offsetX={0}
              offsetY={0}
              scale={1}
              rotation={0}
              speed={0.8}
              colors={['hsl(25, 95%, 55%)', 'hsl(38, 100%, 65%)', 'hsl(15, 90%, 45%)']}
            />
            <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p
                className="text-white font-light tracking-[0.35em] uppercase text-xs"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.4em', opacity: 0.75 }}
              >
                Imagination is the limit
              </p>
            </div>
          </div>

          {/* ===== Right Side — Form ===== */}
          <div className="flex flex-col items-center justify-center p-4 lg:p-7 h-full overflow-y-auto">
            <div className="w-full max-w-[400px] space-y-3">

              <div className="text-left">
                <h1 className="text-[24px] font-normal tracking-tight text-gray-900">
                  {isLogin ? 'Welcome back' : 'Create your account'}
                </h1>
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                {/* Google Button */}
                <button
                  type="button"
                  onClick={() => signIn('google')}
                  className="w-full h-[42px] flex items-center justify-center gap-3 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200 rounded-xl font-normal text-[14px] transition-colors"
                >
                  <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {isLogin ? 'Sign in with Google' : 'Sign up with Google'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 text-gray-400 text-sm">
                  <div className="h-px flex-1 bg-gray-200" />
                  or
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {!isLogin && (
                    <div className="space-y-2">
                      <label htmlFor="username" className="text-[12px] font-normal text-gray-700">Username</label>
                      <input
                        id="username" type="text" required placeholder="johndoe"
                        value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full h-[40px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label htmlFor="email" className="text-[12px] font-normal text-gray-700">Email</label>
                    <input
                      id="email" type="email" required placeholder="name@email.com"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-[40px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="password" className="text-[12px] font-normal text-gray-700">Password</label>
                    <input
                      id="password" type="password" required placeholder="••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-[40px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-[14px] text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <button
                    type="submit" disabled={loading}
                    className="w-full h-[42px] bg-gray-900 text-white hover:bg-gray-800 font-normal rounded-xl text-[14px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : isLogin ? 'Sign in' : 'Create account'}
                  </button>
                </form>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(''); }}
                    className="text-[13px] font-normal text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
