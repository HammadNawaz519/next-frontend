import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.connect.app',
  appName: 'Connect',
  webDir: 'public',
  server: {
    // Redirects the native app to stream your hosted production web application on Vercel
    url: 'https://the-dev-core.vercel.app',
    cleartext: true
  },
  overrideUserAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
  android: {
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'
  },
  ios: {
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  }
};

export default config;
