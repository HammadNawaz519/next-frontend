'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTheme } from '@/app/components/ThemeProvider';
import {
  ArrowLeft, Lock, Eye, EyeOff, Shield, Smartphone, Globe,
  ChevronRight, Check, X, AlertCircle, Clock, LogIn, Key, Users
} from 'lucide-react';

export default function SecurityPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // CONNECT design system — always dark
  const bg = '#222831';
  const card = '#393E46';
  const border = 'rgba(255,255,255,0.08)';
  const txt = '#EEEEEE';
  const sub = 'rgba(238,238,238,0.5)';
  const inputBg = 'rgba(255,255,255,0.05)';
  const inputBorder = 'rgba(255,255,255,0.12)';

  // ── Change Password ──
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpShowCurrent, setCpShowCurrent] = useState(false);
  const [cpShowNew, setCpShowNew] = useState(false);
  const [cpShowConfirm, setCpShowConfirm] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState(false);

  // ── Two-Factor Auth ──
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [showTwoFAModal, setShowTwoFAModal] = useState(false);

  // ── Login Activity ──
  const loginActivity = [
    { device: 'Chrome on Windows', location: 'Lahore, PK', time: 'Active now', current: true },
    { device: 'Safari on iPhone', location: 'Karachi, PK', time: '2 hours ago', current: false },
    { device: 'Firefox on Mac', location: 'Islamabad, PK', time: '3 days ago', current: false },
  ];

  const userEmail = session?.user?.email || '';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError('');
    setCpSuccess(false);
    if (cpNew !== cpConfirm) { setCpError('New passwords do not match.'); return; }
    if (cpNew.length < 6) { setCpError('Password must be at least 6 characters.'); return; }
    setCpLoading(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCpError(data.message || 'Failed to update password.');
      } else {
        setCpSuccess(true);
        setCpCurrent(''); setCpNew(''); setCpConfirm('');
        setTimeout(() => setCpSuccess(false), 4000);
      }
    } catch {
      setCpError('An unexpected error occurred.');
    } finally {
      setCpLoading(false);
    }
  };

  const RowItem = ({
    icon, label, sublabel, onClick, right, danger = false, noBorder = false,
  }: {
    icon: React.ReactNode;
    label: string;
    sublabel?: string;
    onClick?: () => void;
    right?: React.ReactNode;
    danger?: boolean;
    noBorder?: boolean;
  }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '15px 18px',
        borderBottom: noBorder ? 'none' : `1px solid ${border}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ color: danger ? '#ef4444' : txt, display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: danger ? '#ef4444' : txt, margin: 0 }}>{label}</p>
          {sublabel && <p style={{ fontSize: 12, color: sub, margin: '2px 0 0 0' }}>{sublabel}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {right ?? (onClick && (
          <ChevronRight size={16} style={{ color: sub }} />
        ))}
      </div>
    </div>
  );

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: sub, paddingLeft: 4, margin: 0 }}>
      {children}
    </p>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      background: card, border: `1px solid ${border}`,
      borderRadius: 20, overflow: 'hidden',
    }}>
      {children}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top navigation bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px',
        borderBottom: `1px solid ${border}`,
        background: isDark ? '#09090b' : '#fff',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            border: `1px solid ${border}`, cursor: 'pointer', color: txt,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: txt, margin: 0 }}>Password &amp; Security</h1>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Section 1: Change Password ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Password</SectionLabel>
          <Card>
            <div style={{ padding: '20px 18px', borderBottom: `1px solid ${border}` }}>
              <p style={{ fontSize: 13, color: sub, margin: '0 0 16px 0' }}>
                Logged in as <strong style={{ color: txt }}>{userEmail}</strong>
              </p>

              {cpSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                  <Check size={14} style={{ color: '#22c55e' }} />
                  <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Password updated successfully.</span>
                </div>
              )}

              {cpError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                  <AlertCircle size={14} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>{cpError}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Current Password */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: sub, display: 'block', marginBottom: 6 }}>Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: sub }} />
                    <input
                      type={cpShowCurrent ? 'text' : 'password'}
                      value={cpCurrent}
                      onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                      placeholder="Enter current password"
                      required
                      style={{
                        width: '100%', height: 42, borderRadius: 12,
                        border: `1px solid ${inputBorder}`, background: inputBg,
                        color: txt, fontSize: 14, paddingLeft: 36, paddingRight: 40,
                        boxSizing: 'border-box', outline: 'none',
                      }}
                    />
                    <button type="button" onClick={() => setCpShowCurrent(!cpShowCurrent)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: sub }}>
                      {cpShowCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: sub, display: 'block', marginBottom: 6 }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: sub }} />
                    <input
                      type={cpShowNew ? 'text' : 'password'}
                      value={cpNew}
                      onChange={e => { setCpNew(e.target.value); setCpError(''); }}
                      placeholder="Enter new password"
                      required
                      style={{
                        width: '100%', height: 42, borderRadius: 12,
                        border: `1px solid ${inputBorder}`, background: inputBg,
                        color: txt, fontSize: 14, paddingLeft: 36, paddingRight: 40,
                        boxSizing: 'border-box', outline: 'none',
                      }}
                    />
                    <button type="button" onClick={() => setCpShowNew(!cpShowNew)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: sub }}>
                      {cpShowNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: sub, display: 'block', marginBottom: 6 }}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: sub }} />
                    <input
                      type={cpShowConfirm ? 'text' : 'password'}
                      value={cpConfirm}
                      onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      placeholder="Confirm new password"
                      required
                      style={{
                        width: '100%', height: 42, borderRadius: 12,
                        border: `1px solid ${inputBorder}`, background: inputBg,
                        color: txt, fontSize: 14, paddingLeft: 36, paddingRight: 40,
                        boxSizing: 'border-box', outline: 'none',
                      }}
                    />
                    <button type="button" onClick={() => setCpShowConfirm(!cpShowConfirm)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: sub }}>
                      {cpShowConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {cpConfirm && cpNew !== cpConfirm && (
                    <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0 0' }}>Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={cpLoading || !cpCurrent || !cpNew || cpNew !== cpConfirm}
                  style={{
                    width: '100%', height: 42, borderRadius: 12,
                    background: isDark ? '#fff' : '#111',
                    color: isDark ? '#000' : '#fff',
                    border: 'none', fontSize: 14, fontWeight: 700,
                    cursor: (cpLoading || !cpCurrent || !cpNew || cpNew !== cpConfirm) ? 'not-allowed' : 'pointer',
                    opacity: (cpLoading || !cpCurrent || !cpNew || cpNew !== cpConfirm) ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {cpLoading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>

            <RowItem
              icon={<Key size={18} />}
              label="Forgot Password?"
              sublabel="Send a reset code to your email"
              onClick={() => router.push('/?reset=1')}
              noBorder
            />
          </Card>
        </div>

        {/* ── Section 2: Two-Factor Authentication ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Two-Factor Authentication</SectionLabel>
          <Card>
            <RowItem
              icon={<Shield size={18} />}
              label="Two-Factor Authentication"
              sublabel={twoFAEnabled ? 'Enabled — your account is protected' : 'Add an extra layer of security'}
              right={
                <button
                  onClick={() => { setTwoFAEnabled(!twoFAEnabled); setShowTwoFAModal(!twoFAEnabled); }}
                  style={{
                    width: 44, height: 24, borderRadius: 100, border: 'none',
                    background: twoFAEnabled ? (isDark ? '#fff' : '#111') : (isDark ? '#3a3a3c' : '#d1d5db'),
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: twoFAEnabled && isDark ? '#000' : '#fff',
                    position: 'absolute', top: 3,
                    left: twoFAEnabled ? 23 : 3,
                    transition: 'left 0.2s',
                  }} />
                </button>
              }
              noBorder
            />
          </Card>
        </div>

        {/* ── Section 3: Login Activity ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Login Activity</SectionLabel>
          <Card>
            {loginActivity.map((activity, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: i < loginActivity.length - 1 ? `1px solid ${border}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: isDark ? '#1c1c1e' : '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {activity.device.includes('iPhone') || activity.device.includes('Android')
                      ? <Smartphone size={17} style={{ color: sub }} />
                      : <Globe size={17} style={{ color: sub }} />
                    }
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: txt, margin: 0 }}>{activity.device}</p>
                    <p style={{ fontSize: 11, color: sub, margin: '2px 0 0 0' }}>{activity.location} · {activity.time}</p>
                  </div>
                </div>
                {activity.current ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', borderRadius: 20, padding: '3px 10px' }}>
                    This Device
                  </span>
                ) : (
                  <button style={{
                    fontSize: 12, fontWeight: 600, color: '#ef4444',
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}>
                    Log Out
                  </button>
                )}
              </div>
            ))}
          </Card>
          <p style={{ fontSize: 12, color: sub, padding: '0 4px' }}>
            If you see activity you don&apos;t recognise, log out of that session and change your password immediately.
          </p>
        </div>

        {/* ── Section 4: Saved Login Info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Saved Login Info</SectionLabel>
          <Card>
            <RowItem
              icon={<Users size={18} />}
              label="Manage Saved Accounts"
              sublabel="View or remove accounts saved on this device"
              onClick={() => router.push('/accounts')}
            />
            <RowItem
              icon={<LogIn size={18} />}
              label="Login Methods"
              sublabel={userEmail ? `Email: ${userEmail}` : 'Email'}
              noBorder
            />
          </Card>
        </div>

        {/* ── Section 5: Account Security Tips ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Security Tips</SectionLabel>
          <Card>
            {[
              { icon: <Shield size={17} />, text: 'Use a unique password not used on other sites' },
              { icon: <Clock size={17} />, text: 'Change your password every few months' },
              { icon: <AlertCircle size={17} />, text: 'Never share your password or OTP codes with anyone' },
            ].map((tip, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 18px',
                borderBottom: i < 2 ? `1px solid ${border}` : 'none',
              }}>
                <span style={{ color: sub, flexShrink: 0 }}>{tip.icon}</span>
                <p style={{ fontSize: 13, color: sub, margin: 0 }}>{tip.text}</p>
              </div>
            ))}
          </Card>
        </div>

      </div>

      {/* ── Two-Factor Setup Modal ── */}
      {showTwoFAModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: isDark ? '#18181b' : '#fff',
            border: `1px solid ${border}`, borderRadius: 24,
            padding: 28, width: '100%', maxWidth: 380,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: txt, margin: 0 }}>Two-Factor Authentication</h2>
              <button onClick={() => { setShowTwoFAModal(false); setTwoFAEnabled(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: isDark ? '#1c1c1e' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={28} style={{ color: txt }} />
              </div>
            </div>

            <p style={{ fontSize: 14, color: sub, textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
              Two-factor authentication adds an extra layer of security to your account. When enabled, you&apos;ll need your password and a verification code to sign in.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setShowTwoFAModal(false); }}
                style={{
                  width: '100%', height: 44, borderRadius: 12,
                  background: isDark ? '#fff' : '#111', color: isDark ? '#000' : '#fff',
                  border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Enable via Authenticator App
              </button>
              <button
                onClick={() => { setShowTwoFAModal(false); setTwoFAEnabled(false); }}
                style={{
                  width: '100%', height: 44, borderRadius: 12,
                  background: isDark ? '#27272a' : '#f3f4f6', color: txt,
                  border: `1px solid ${border}`, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
