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
    
    // Get click position or default to top-right
    const x = e.clientX || window.innerWidth;
    const y = e.clientY || 0;

    // Calculate max diagonal to ensure full coverage
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    // 1. Set Ripple state for CSS fallback overlay
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

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 700,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });

    transition.finished.finally(() => {
      setTimeout(() => {
        setRipple(prev => ({ ...prev, active: false }));
      }, 300);
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, ripple }}>
      {children}
    </ThemeContext.Provider>
  );
}
