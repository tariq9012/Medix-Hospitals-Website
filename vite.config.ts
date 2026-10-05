import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    // Ensure a single copy of React/TanStack Router is used, avoiding
    // duplicate-instance issues (invalid hook calls, context mismatches).
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
    // Native tsconfig `paths` support (Vite >= 7): keeps the `@/*` alias in sync with
    // tsconfig.json without the `vite-tsconfig-paths` plugin.
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    nitro(),
    viteReact(),
  ],
});
