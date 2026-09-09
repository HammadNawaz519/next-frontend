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
  overrideUserAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  android: {
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    allowMixedContent: true
  },
  ios: {
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  }
};

export default config;
