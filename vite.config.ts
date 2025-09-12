import data from '@seahax/vite-plugin-data';
import lib from '@seahax/vite-plugin-lib';
import { defineConfig } from 'vite';

process.chdir(import.meta.dirname);

export default defineConfig({
  plugins: [
    lib({ runtime: 'node', fileName: '[name]' }),
    data(),
  ],
});
