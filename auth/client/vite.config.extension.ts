import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Ensure public directory is copied to output
  publicDir: 'public',
  build: {
    outDir: 'dist/extension',
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/extension/popup.tsx'),
        content: path.resolve(__dirname, 'src/extension/content.ts'),
        background: path.resolve(__dirname, 'public/background.js'),
      },
      external: [],
      output: {
        format: 'es', // Use ES modules for service worker compatibility
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          // Keep logo.png at root level, not in assets folder
          if (assetInfo.name && assetInfo.name.endsWith('logo.png')) {
            return 'logo.png';
          }
          return 'assets/[name].[ext]';
        },
      },
    },
    // Copy public assets (like logo.png) to output
    copyPublicDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
