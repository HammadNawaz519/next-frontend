'use client';

import { useTheme } from '@/app/components/ThemeProvider';
import { useEffect, useState } from 'react';

export default function RippleOverlay() {
  const { ripple } = useTheme();
  const [size, setSize] = useState(0);

  useEffect(() => {
    if (ripple.active) {
      // Calculate max diagonal of the viewport so ripple covers entire screen
      const maxDim = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2) * 2.2;
      setSize(maxDim);
    } else {
      setSize(0);
    }
  }, [ripple.active]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          background: ripple.color,
          width: ripple.active ? `${size}px` : '0px',
          height: ripple.active ? `${size}px` : '0px',
          left: ripple.x,
          top: ripple.y,
          transform: 'translate(-50%, -50%)',
          transition: ripple.active
            ? 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1), height 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.8s ease'
            : 'width 0.3s ease, height 0.3s ease, opacity 0.3s ease',
          opacity: ripple.active ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
