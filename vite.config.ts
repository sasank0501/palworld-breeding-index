/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    // combos.json is ~700KB raw; it is dynamically imported so it lands in its own
    // chunk rather than blocking first paint. Raise the warning bar accordingly.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
