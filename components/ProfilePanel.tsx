'use client';

import React, { useState } from 'react';
import { signOut } from 'next-auth/react';

interface ProfilePanelProps {
  isOpen: boolean;
  isClosing: boolean;
  onClose: () => void;
  session: any;
  fullUser: any;
  isDark: boolean;
  onEditName: () => void;
  onInstall: () => void;
}

const HIGHLIGHTS = ['Morning', 'Travel', 'Food', 'Work', 'Friends'];
const POST_COUNT = 6;

export default function ProfilePanel({
  isOpen,
  isClosing,
  onClose,
  session,
  fullUser,
  isDark,
  onEditName,
  onInstall,
}: ProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<'grid' | 'reels' | 'tagged'>('grid');

  if (!isOpen) return null;

  const name = fullUser?.name || session?.user?.name || 'User';
  const email = fullUser?.email || session?.user?.email || '';
  const image = fullUser?.image || session?.user?.image;
  const username = (fullUser?.username || email?.split('@')[0] || 'user').toLowerCase().replace(/\s+/g, '');

  return (
    <div
      className={isClosing ? 'animate-profile-out' : 'animate-profile-in'}
      style={{
        position: 'absolute',
        inset: '0',
        right: 0,
        width: '100%',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: isDark ? '#0e0e11' : '#ffffff',
        borderLeft: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* ── 1. Top Nav Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0'}`,
        flexShrink: 0,
      }}>
        {/* Back button */}
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
            border: 'none', cursor: 'pointer',
            color: isDark ? '#fff' : '#111',
          }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        {/* Username */}
        <span style={{ fontWeight: 700, fontSize: '16px', color: isDark ? '#fff' : '#111' }}>
          @{username}
        </span>

        {/* Right icons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onInstall}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#fff' : '#111', padding: 4 }}
            title="Install App"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
            title="Sign Out"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── 2. Profile Header (Stats) ── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 16px 8px', gap: 24 }}>
          {/* Avatar */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
            background: isDark ? '#26262d' : '#e5e7eb',
            border: `3px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db'}`,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {image ? (
              <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
            ) : (
              <span style={{ fontSize: 28, fontWeight: 700, color: isDark ? '#fff' : '#374151' }}>
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Stats */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
            {[{ num: '0', label: 'Posts' }, { num: '0', label: 'Followers' }, { num: '0', label: 'Following' }].map(s => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 17, color: isDark ? '#fff' : '#111' }}>{s.num}</span>
                <span style={{ fontSize: 12, color: isDark ? '#a1a1aa' : '#6b7280' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3. Bio Section ── */}
        <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: isDark ? '#fff' : '#111' }}>{name}</span>
          <span style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#374151' }}>ASL Communicator & Language Learner 🤟</span>
          <span style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#374151' }}>Breaking barriers, one sign at a time.</span>
          <span style={{ fontSize: 13, color: isDark ? '#a1a1aa' : '#374151' }}>Building inclusive communities worldwide.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" fill="none" stroke="#6366f1" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>connect.app</span>
          </div>
        </div>

        {/* ── 4. Action Buttons ── */}
        <div style={{ display: 'flex', padding: '0 16px 12px', gap: 8 }}>
          <button
            onClick={onEditName}
            style={{
              flex: 1, padding: '8px', borderRadius: 10, fontWeight: 600, fontSize: 13,
              background: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#e5e7eb'}`,
              color: isDark ? '#fff' : '#111', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Edit Profile
          </button>
          <button
            style={{
              flex: 1, padding: '8px', borderRadius: 10, fontWeight: 600, fontSize: 13,
              background: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#e5e7eb'}`,
              color: isDark ? '#fff' : '#111', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: name, text: `Check out ${name} on Connect!`, url: window.location.href });
              }
            }}
          >
            Share Profile
          </button>
        </div>

        {/* ── 5. Highlights Section ── */}
        <div style={{
          display: 'flex', gap: 16, padding: '8px 16px 16px',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {HIGHLIGHTS.map((label, i) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: `2px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#d1d5db'}`,
                padding: 3,
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  background: isDark
                    ? `hsl(${i * 60}, 50%, 20%)`
                    : `hsl(${i * 60}, 60%, 90%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 20 }}>
                    {['🌅', '✈️', '🍕', '💼', '👥'][i]}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: isDark ? '#a1a1aa' : '#6b7280' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* ── 6. Tab Navigation ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`,
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#f0f0f0'}`,
        }}>
          {([
            { id: 'grid', icon: (
              <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z" />
              </svg>
            )},
            { id: 'reels', icon: (
              <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            )},
            { id: 'tagged', icon: (
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )},
          ] as { id: 'grid' | 'reels' | 'tagged', icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', justifyContent: 'center', padding: '12px 0',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab.id
                  ? `2px solid ${isDark ? '#fff' : '#111'}`
                  : '2px solid transparent',
                color: activeTab === tab.id
                  ? (isDark ? '#fff' : '#111')
                  : (isDark ? '#a1a1aa' : '#9ca3af'),
                transition: 'all 0.2s',
              }}
            >
              {tab.icon}
            </button>
          ))}
        </div>

        {/* ── 7. Image Grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
          {Array.from({ length: POST_COUNT }).map((_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1 / 1',
                background: isDark
                  ? `hsl(${220 + i * 15}, 20%, ${15 + i * 3}%)`
                  : `hsl(${220 + i * 15}, 30%, ${80 - i * 5}%)`,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {/* Placeholder gradient content */}
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(135deg, transparent 60%, rgba(0,0,0,0.3))`,
              }} />
              {/* Multi-image icon on some */}
              {(i === 1 || i === 4) && (
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                }}>
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2 6a2 2 0 012-2h11a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm18 2v7a4 4 0 01-4 4H6a4 4 0 004 4h8a4 4 0 004-4V8z" />
                  </svg>
                </div>
              )}
              {/* Video icon on one */}
              {i === 2 && (
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
                }}>
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom spacer */}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
