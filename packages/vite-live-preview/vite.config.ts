import finalize from '@seahax/vite-plugin-finalize';
import { defineConfig } from 'vite';
import { lib } from 'vite-plugin-config-lib';
import { data } from 'vite-plugin-data';

process.chdir(import.meta.dirname);

export default defineConfig({
  plugins: [
    lib({ entry: ['src/index.ts', 'src/bin.ts'] }),
    data() as any,
    finalize`tsc -b --force`,
  ],
});
