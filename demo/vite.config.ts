import { defineConfig } from 'vite';

import preview from '../dist/index.js';

process.chdir(import.meta.dirname);

export default defineConfig({
  plugins: [preview({ debug: true })],
  preview: {
    host: '127.0.0.1',
  },
});
