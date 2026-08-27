import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NextAuthProvider } from "./components/NextAuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";

const geistSans = { variable: "--font-geist-sans" };
const geistMono = { variable: "--font-geist-mono" };

export const metadata: Metadata = {
  title: "Connect",
  description: "Connect — Chat, call, and AI in one place.",
  icons: {
    icon: "/icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Connect",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  verification: {
    google: "googlebeec3702392f09eb",
  },
  robots: {
    index: true,
    follow: true,
  }
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />
        {/* Apple PWA */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Connect" />
        {/* Theme */}
        <meta name="theme-color" content="#000000" />
        {/* Google Fonts (Non-blocking async load) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Comfortaa:wght@600&family=Fira+Code:wght@500&family=Oswald:wght@600&family=Playfair+Display:wght@600&family=Satisfy&display=swap"
          rel="stylesheet"
          media="print"
          // @ts-ignore
          onLoad="this.media='all'"
        />
        <noscript>
          <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Comfortaa:wght@600&family=Fira+Code:wght@500&family=Oswald:wght@600&family=Playfair+Display:wght@600&family=Satisfy&display=swap" rel="stylesheet" />
        </noscript>
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NextAuthProvider>{children}</NextAuthProvider>
        </ThemeProvider>
        {/* Register service worker */}
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                    navigator.serviceWorker.getRegistrations().then(function(registrations) {
                      for (let reg of registrations) { reg.unregister(); }
                    });
                  } else {
                    navigator.serviceWorker.register('/sw.js')
                      .then(function(reg) { console.log('SW registered'); })
                      .catch(function(err) { console.log('SW error:', err); });
                  }
                });
              }
            `,
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
