import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Asset paths are absolute by design: the Vite output is served from the
// root of the Cloudflare Workers Static Assets binding, so `base: '/'` is
// required for hashed asset URLs to resolve correctly under any deep
// hash-route. `build.sourcemap: false` keeps source paths out of the
// production deploy.
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      compositions: path.resolve(here, "./src/sds/ui/compositions"),
      data: path.resolve(here, "./src/sds/data"),
      hooks: path.resolve(here, "./src/sds/ui/hooks"),
      icons: path.resolve(here, "./src/sds/ui/icons"),
      images: path.resolve(here, "./src/sds/ui/images"),
      layout: path.resolve(here, "./src/sds/ui/layout"),
      primitives: path.resolve(here, "./src/sds/ui/primitives"),
      utils: path.resolve(here, "./src/sds/ui/utils"),
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
  },
});
