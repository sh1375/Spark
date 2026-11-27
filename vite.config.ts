import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, mkdirSync, copyFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

// Copies required public assets; a failed copy must fail the build.
function safeCopyPublicDir(): Plugin {
  let root = '';
  let isBuild = false;
  return {
    name: 'safe-copy-public-dir',
    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
    },
    closeBundle() {
      if (!isBuild) return;
      const publicDir = join(root, 'public');
      const distDir = join(root, 'dist');
      copyDirSafe(publicDir, distDir);

      // The login renders the Spark logo at about 70px. Reuse the existing
      // 192px branded PWA icon in production instead of shipping the 1024px
      // source PNG for the same small UI surface. The public URL stays stable.
      const compactLogo = join(publicDir, 'icons', 'icon-192x192.png');
      if (existsSync(compactLogo)) {
        copyFileSync(compactLogo, join(distDir, 'logo_spark.png'));
      }
    },
  };
}

function copyDirSafe(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSafe(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), safeCopyPublicDir()],
  build: {
    // Disable Vite's built-in public dir copy; safeCopyPublicDir handles it
    // and propagates failures instead of publishing incomplete assets.
    copyPublicDir: false,
    // Explicitly disable sourcemaps in production. Without this, a future
    // accidental change to sourcemap: true would expose original source code.
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    host: true,
    open: true
  },
  preview: {
    port: 5173,
    host: true
  },
  define: {
    global: 'window',
    ...(command === 'build'
      ? {
          // Never bake an internal IP or a specific DNS name into production.
          // Every legacy VITE_SUPABASE_URL reference is compiled to the current
          // browser origin, so all Supabase HTTP/WebSocket traffic follows the
          // same reverse-proxy hostname that served Spark.
          'import.meta.env.VITE_SUPABASE_URL': 'window.location.origin',
        }
      : {}),
  }
}));
