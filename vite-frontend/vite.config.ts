import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"),
);

const readGitMetadata = (command: string, fallback: string) => {
  try {
    return execSync(command, {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
};

const appVersion = process.env.VITE_APP_VERSION || packageJson.version || "0.0.0";
const gitSha = process.env.VITE_GIT_SHA || readGitMetadata("git rev-parse --short HEAD", "local");
const gitBranch =
  process.env.VITE_GIT_BRANCH || readGitMetadata("git rev-parse --abbrev-ref HEAD", "local");
const buildTime = process.env.VITE_BUILD_TIME || new Date().toISOString();

export default defineConfig({
  plugins: [
    react()
  ],
  base: './',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_SHA__: JSON.stringify(gitSha),
    __GIT_BRANCH__: JSON.stringify(gitBranch),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: false,
    rollupOptions: {
      treeshake: false,
    }
  }
});
