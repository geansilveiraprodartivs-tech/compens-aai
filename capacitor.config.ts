import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.compensai',
  appName: 'CompensAI',
  webDir: 'www',
  androidScheme: 'https',
  server: {
    url: 'https://compens-aai.lovable.app',
    cleartext: false,
  },
};

export default config;