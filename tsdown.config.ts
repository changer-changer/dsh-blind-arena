import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-blind-arena'

export default defineConfig([
  {
    name: `${PACKAGE_ID}/host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: true,
    // Never minify or mangle: SRC-mode RPC reads business method parameter
    // names from the shipped function source (dsh-api-gateway methodParameterNames).
    minify: false,
    deps: {
      // The host loader resolves @deepseek-ai/* to the running DSH's own
      // instances — bundling a private copy would split cordis Service state.
      neverBundle: [/^@deepseek-ai\//],
    },
    outputOptions: {
      entryFileNames: 'index.js',
    },
  },
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
    deps: {
      neverBundle: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
