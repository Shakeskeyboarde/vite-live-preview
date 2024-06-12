import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import { lib } from 'vite-plugin-config-lib';
import { data } from 'vite-plugin-data';

process.chdir(__dirname);

export default defineConfig({
  plugins: [
    checker({ typescript: { tsconfigPath: 'src/tsconfig.json' } }),
    lib({ entry: 'src/index.ts', bundle: true, external: 'auto' }),
    data(),
  ],
});
