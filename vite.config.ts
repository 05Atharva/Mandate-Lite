import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client' },
  server: {
    watch: { ignored: ['**/.local/**', '**/data/**'] },
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/.local/**',
        '**/data/**',
        '**/*.sqlite*',
        '**/*.db*',
        '**/server/**',
        '**/tests/**',
        '**/scripts/**',
      ],
    },
  },
});
