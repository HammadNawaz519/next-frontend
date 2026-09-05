import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.connect.app',
  appName: 'Connect',
  webDir: 'public',
  server: {
    // Redirects the native app to stream your hosted production web application on Vercel
    url: 'https://myconnectapp.vercel.app',
    cleartext: true,
    allowNavigation: [
      'myconnectapp.vercel.app',
      '*.vercel.app',
      'accounts.google.com',
      '*.google.com',
      '*.googleusercontent.com',
      '*.googleapis.com',
      '*.gstatic.com'
    ]
  },
  overrideUserAgent: 'Mozilla/5.0 (Android 13; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
  android: {
    overrideUserAgent: 'Mozilla/5.0 (Android 13; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
    allowMixedContent: true
  },
  ios: {
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  }
};

export default config;
