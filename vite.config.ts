import { defineConfig } from 'vite';
import { lib } from 'vite-plugin-config-lib';
import { data } from 'vite-plugin-data';
import dts from 'vite-plugin-dts';

process.chdir(__dirname);

export default defineConfig({
  plugins: [
    lib({ entry: ['src/index.ts', 'src/bin.ts'] }),
    data(),
    dts({ tsconfigPath: 'src/tsconfig.json' }),
  ],
});
