/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
import { buildData } from "./scripts/merge-explain";

/** Servíruje /data/*.json složené z data/ a data/explain/ – změna vysvětlení se projeví hned. */
function vmpData(): Plugin {
  let root = process.cwd();
  return {
    name: "vmp-data",
    configResolved(c) {
      root = c.root;
    },
    configureServer(server) {
      const dataDir = resolve(root, "data");
      server.watcher.add(dataDir);
      server.watcher.on("change", (f) => {
        if (resolve(f).startsWith(dataDir) && f.endsWith(".json")) {
          const r = buildData(root);
          r.warnings.forEach((w) => server.config.logger.warn("⚠ " + w));
          server.ws.send({ type: "full-reload" });
        }
      });
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/(data\/[a-z]+\.json)(\?.*)?$/);
        if (!m) return next();
        try {
          const body = buildData(root).files[m[1]];
          if (!body) return next();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error).message));
        }
      });
    },
    generateBundle() {
      const r = buildData(root);
      r.summary.forEach((s) => this.info(s));
      if (r.warnings.length) this.error(r.warnings.join("\n"));
      for (const [fileName, source] of Object.entries(r.files)) this.emitFile({ type: "asset", fileName, source });
    },
  };
}

export default defineConfig({
  // relativní base funguje na GitHub Pages i lokálně; lze přepsat proměnnou BASE
  base: process.env.BASE ?? "./",
  plugins: [
    vmpData(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["img/*", "icons/*"],
      manifest: {
        name: "VMP trenažér – Vůdce malého plavidla",
        short_name: "VMP trenažér",
        description: "Offline trenažér oficiálních otázek SPS ke zkoušce Vůdce malého plavidla.",
        lang: "cs",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#0f1720",
        theme_color: "#0f4c75",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,png,jpg,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
