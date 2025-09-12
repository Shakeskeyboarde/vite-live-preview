import path from 'node:path';

import { build, type Rollup } from 'vite';

const result = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2022',
    minify: true,
    lib: {
      entry: path.resolve(import.meta.dirname, '../template/client.ts'),
      formats: ['cjs'],
    },
  },
}) as Rollup.RollupOutput[];

export default result[0]!.output[0].code.trim();
