import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHandler } from "./server/judge.ts";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-judge-api",
      configureServer(server) {
        const handler = createHandler();
        server.middlewares.use("/api/judge", (req, res) => {
          void handler(req, res);
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5178 },
});
