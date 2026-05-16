'use client';

import { useTheme } from '@/app/components/ThemeProvider';
import { useState } from 'react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [isPressed, setIsPressed] = useState(false);

  return (
    <button
      onClick={toggleTheme}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '66px',
        height: '34px',
        borderRadius: '999px',
        padding: '3px',
        cursor: 'pointer',
        border: isDark ? '1.5px solid rgba(255,255,255,0.1)' : '1.5px solid rgba(0,0,0,0.08)',
        background: isDark
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.04)',
        transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        transform: isPressed ? 'scale(0.92)' : 'scale(1)',
        outline: 'none',
        flexShrink: 0,
        boxShadow: isDark ? 'inset 0 2px 4px rgba(0,0,0,0.4)' : 'inset 0 2px 4px rgba(0,0,0,0.05)',
      }}
    >
      {/* Track icons */}
      <span style={{
        position: 'absolute',
        left: '9px',
        top: '50%',
        transform: 'translateY(-50%)',
        opacity: isDark ? 0 : 0.6,
        transition: 'opacity 0.4s ease',
        display: 'flex',
        pointerEvents: 'none',
      }}>
        {/* Sun SVG */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      </span>

      <span style={{
        position: 'absolute',
        right: '9px',
        top: '50%',
        transform: 'translateY(-50%)',
        opacity: isDark ? 0.6 : 0,
        transition: 'opacity 0.4s ease',
        display: 'flex',
        pointerEvents: 'none',
      }}>
        {/* Moon SVG */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </span>

      {/* Thumb */}
      <span style={{
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        background: isDark ? '#ffffff' : '#000000',
        transform: isDark ? (isPressed ? 'translateX(30px) scale(0.95)' : 'translateX(32px)') : (isPressed ? 'translateX(2px) scale(0.95)' : 'translateX(0px)'),
        transition: 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.4s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isDark
          ? '0 4px 12px rgba(255,255,255,0.3)'
          : '0 4px 12px rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}>
        {/* Icon inside thumb */}
        {isDark ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        )}
      </span>
    </button>
  );
}
