import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ncr:  resolve(__dirname, 'ncr.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // `.claude/worktrees` holds full checkouts of the repo, so the default
    // include picked up a second (stale) copy of every test file and ran it —
    // `npm test` reported twice the tests it has, failing on code that is not
    // in the working tree. `tests/` is Playwright, not vitest.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'tests/**'],
  },
})
