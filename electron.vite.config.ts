import { join } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      target: 'node20',
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      },
      input: {
        index: join(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: join(__dirname, 'src/renderer'),
    base: './',
    plugins: [react()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: join(__dirname, 'src/renderer/index.html'),
          overlay: join(__dirname, 'src/renderer/overlay.html'),
          annotation: join(__dirname, 'src/renderer/annotation.html')
        }
      }
    }
  }
});
