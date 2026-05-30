import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.connect.app',
  appName: 'Connect',
  webDir: 'public',
  server: {
    // Redirects the native app to stream your hosted production web application on Vercel
    url: 'https://next-frontend-nu-liard.vercel.app',
    cleartext: true
  }
};

export default config;
