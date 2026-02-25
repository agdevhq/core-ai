export function buildConfig({ plugins = [], ...options } = {}) {
    return {
        entryPoints: ['src/index.ts'],
        bundle: true,
        outdir: 'dist',
        platform: 'node',
        format: 'esm',
        banner: {
            js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);const __dirname = import.meta.dirname;',
        },
        plugins: [
            ...plugins,
        ],
        ...options,
    };
}
