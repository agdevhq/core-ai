import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/compat.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    outDir: 'dist',
});
