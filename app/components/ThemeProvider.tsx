'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (e: React.MouseEvent) => void;
  ripple: {
    active: boolean;
    x: number;
    y: number;
    color: string;
  };
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  ripple: { active: false, x: 0, y: 0, color: '#fff' }
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [ripple, setRipple] = useState({ active: false, x: 0, y: 0, color: '#fff' });

  // Persist theme
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
      document.documentElement.setAttribute('data-theme', stored);
    }
  }, []);

  const toggleTheme = useCallback((e: React.MouseEvent) => {
    const next = theme === 'light' ? 'dark' : 'light';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX || (rect.left + rect.width / 2);
    const y = e.clientY || (rect.top + rect.height / 2);

    // Trigger Ripple Overlay
    setRipple({ 
      active: true, 
      x, 
      y, 
      color: next === 'dark' ? '#000' : '#fff' 
    });

    if (!document.startViewTransition) {
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      setTimeout(() => setRipple(prev => ({ ...prev, active: false })), 1000);
      return;
    }

    const transition = document.startViewTransition(() => {
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });

    transition.finished.finally(() => {
      setTimeout(() => {
        setRipple(prev => ({ ...prev, active: false }));
      }, 500);
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, ripple }}>
      {children}
    </ThemeContext.Provider>
  );
}
