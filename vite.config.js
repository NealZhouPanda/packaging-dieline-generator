import { defineConfig } from "vite";

export default defineConfig({
  // The offline deliverables are single HTML files. Keep the official
  // corrugated cut-edge atlas inline as a data URL instead of leaving a
  // /assets/*.png reference that cannot resolve when the file is opened
  // directly from disk.
  build: {
    assetsInlineLimit: Infinity,
  },
  server: {
    watch: {
      ignored: ["**/.codex-backups/**", "**/.codex-tmp/**"],
    },
  },
  test: {
    exclude: ["**/.codex-backups/**", "**/.codex-tmp/**", "**/node_modules/**"],
  },
});
