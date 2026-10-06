/// <reference types="vitest" />
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Two builds from one codebase.
 *
 *   npm run build         dist/         the public site: no game art at all
 *   npm run build:resume  dist-resume/  the portfolio site: stills, models, icons
 *
 * public/ also holds things that must never be deployed from this machine, so
 * Vite's blanket copy of it is turned off and replaced by the plugin below:
 *
 *   roster.json   the personal save. The app prefers it over the demo roster, so
 *                 shipping it would publish the save. Dropped from both builds.
 *   game art      pal-models/, pal-portraits/, work-icons/, element-icons/ and pals/ are extracted
 *                 or fetched locally (`npm run build-portraits`). Public build
 *                 drops them; the resume build keeps them.
 *
 * In the resume build the model folder served is public/pal-models-lite/ (made by
 * `npm run build-models -- --lite`), copied as pal-models/, because the full set
 * is far too large to host. Without a lite set it falls back to the full one.
 */
const GAME_ART = ['pal-models', 'pal-models-lite', 'pal-portraits', 'work-icons', 'element-icons', 'pals'];
const NEVER = ['roster.json'];
const LITE = 'pal-models-lite';

const fmtSize = (bytes: number): string =>
  bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;

function dirSize(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

function copyPublic(resume: boolean): Plugin {
  let root = '';
  let outDir = '';
  return {
    name: 'copy-public-selectively',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const pub = path.join(root, 'public');
      if (!fs.existsSync(pub)) return;
      const hasLite = fs.existsSync(path.join(pub, LITE));

      for (const name of fs.readdirSync(pub)) {
        if (NEVER.includes(name)) continue;
        let target = name;
        if (GAME_ART.includes(name)) {
          if (!resume) continue;
          // The lite set stands in for the full one in the portfolio build.
          if (name === LITE) target = 'pal-models';
          else if (name === 'pal-models' && hasLite) continue;
        }
        fs.cpSync(path.join(pub, name), path.join(outDir, target), { recursive: true });
      }

      const kept = fs.readdirSync(outDir).filter((n) => GAME_ART.includes(n) || n === 'pal-models');
      console.log(
        `\n[${resume ? 'resume' : 'public'}] ${path.relative(root, outDir)} is ${fmtSize(dirSize(outDir))}` +
          (kept.length ? `, with game art: ${kept.join(', ')}` : ', no game art'),
      );
      if (resume && !hasLite && fs.existsSync(path.join(pub, 'pal-models'))) {
        console.warn('[resume] no public/pal-models-lite/ — shipping the FULL models. Run `npm run build-models -- --lite`.');
      }
    },
  };
}

/**
 * Dev server only: lets the local chibi review tool (#chibi, gitignored) save the
 * review as you go to scripts/.cache/chibi-review.json, so the notes can be read
 * straight from the project instead of copied out of the browser. Never in a build.
 */
function chibiReviewStore(root: string): Plugin {
  const file = path.join(root, 'scripts', '.cache', 'chibi-review.json');
  return {
    name: 'chibi-review-store',
    apply: 'serve',
    configureServer(server) {
      // Read-only: what was changed in reply to the last review (written by hand
      // or by a session after rebuilding models), shown beside each pal's note.
      const replies = path.join(path.dirname(file), 'chibi-review-replies.json');
      server.middlewares.use('/__chibi-review-replies', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(fs.existsSync(replies) ? fs.readFileSync(replies) : '{}');
      });
      server.middlewares.use('/__chibi-review', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(fs.existsSync(file) ? fs.readFileSync(file) : '{}');
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            JSON.parse(body); // only well-formed JSON is written
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, body);
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), copyPublic(mode === 'resume'), chibiReviewStore(process.cwd())],
  // The save-import worker loads the Oodle decoder (ooz-wasm) with a dynamic
  // import, which the default classic-script worker bundle cannot do.
  worker: { format: 'es' },
  server: {
    watch: {
      // scripts/ holds build-time tooling, none of which the app imports. The
      // dotnet extractor in scripts/pal-textures/ locks its .csproj and churns
      // bin/obj while building, and the watcher crashes the whole dev server
      // with EBUSY when it tries to follow that.
      ignored: ['**/scripts/**'],
    },
  },
  build: {
    // ES2022 for top-level await, which ooz-wasm uses. Every browser with module
    // workers (Chrome 80+, Firefox 114+, Safari 15+), which the importer needs anyway, has it.
    target: 'es2022',
    // combos.json is ~700KB raw; it is dynamically imported so it lands in its own
    // chunk rather than blocking first paint. Raise the warning bar accordingly.
    chunkSizeWarningLimit: 900,
    // public/ is copied by copyPublic() above, selectively.
    copyPublicDir: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
