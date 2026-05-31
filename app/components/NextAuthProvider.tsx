"use client";

import { SessionProvider } from "next-auth/react";

export const NextAuthProvider = ({ children }: { children: React.ReactNode }) => {
  // If we are running in a native mobile app (WebView on capacitor:// or localhost without port), 
  // point NextAuth to the absolute URL of the production server API.
  const basePath = typeof window !== 'undefined' && (
    (window as any).Capacitor ||
    window.location.origin.includes('capacitor://') || 
    window.location.protocol === 'file:' ||
    (window.location.hostname === 'localhost' && !window.location.port)
  )
    ? 'https://the-dev-core.vercel.app/api/auth'
    : undefined;

  return <SessionProvider basePath={basePath}>{children}</SessionProvider>;
};
