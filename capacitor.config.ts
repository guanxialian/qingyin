import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qingyin.app',
  appName: 'K-ON',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0b0f',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // 原生环境让 fetch/XHR 走原生 HTTP，绕开 CORS，并能带上 Referer
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
