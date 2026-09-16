import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function libredwgWasm(): Plugin {
  const srcDir = path.resolve('node_modules/@mlightcad/libredwg-web/wasm');
  const copyTo = (outDir: string) => {
    if (!fs.existsSync(srcDir)) return;
    const dest = path.join(outDir, 'wasm');
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(dest, file));
    }
  };
  return {
    name: 'libredwg-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/wasm/')) return next();
        const name = decodeURIComponent((req.url.slice('/wasm/'.length).split('?')[0] ?? '').replace(/\/+$/, ''));
        const file = path.join(srcDir, name);
        if (!name || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/javascript');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      copyTo(path.resolve('dist'));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), libredwgWasm()],
  optimizeDeps: {
    exclude: ['@mlightcad/libredwg-web'],
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
