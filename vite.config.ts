import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { buildServerConfig } from "./server/src/httpConfig.js";

const serverConfig = buildServerConfig(process.env);

function readHttpsOptions() {
  if (!serverConfig.https) return undefined;
  return {
    cert: fs.readFileSync(serverConfig.https.certPath),
    key: fs.readFileSync(serverConfig.https.keyPath)
  };
}

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    host: serverConfig.host,
    port: 5173,
    https: readHttpsOptions(),
    proxy: {
      "/api": {
        target: `${serverConfig.publicProtocol}://127.0.0.1:${serverConfig.port}`,
        secure: false,
        ws: true
      }
    }
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true
  }
});
