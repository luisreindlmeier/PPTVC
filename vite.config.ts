import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import os from "os";

// Use office-addin-dev-certs for trusted HTTPS (required by Office Add-ins)
function getHttpsOptions() {
  const certDir = path.join(os.homedir(), ".office-addin-dev-certs");
  const keyPath = path.join(certDir, "localhost.key");
  const certPath = path.join(certDir, "localhost.crt");
  const caPath = path.join(certDir, "ca.crt");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined,
    };
  }
  // Fallback: Vite will generate a self-signed cert
  return true;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 3000,
    https: getHttpsOptions(),
    headers: { "Access-Control-Allow-Origin": "*" },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        taskpane: path.resolve(__dirname, "taskpane.html"),
        commands: path.resolve(__dirname, "commands.html"),
      },
    },
  },
});
