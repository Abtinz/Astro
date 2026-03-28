import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 3001,
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.DEEP_AGENT_API_URL': JSON.stringify(env.DEEP_AGENT_API_URL || 'http://127.0.0.1:8010'),
    },
    optimizeDeps: {
      include: ['@google/genai', 'react', 'react-dom'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
