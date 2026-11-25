// Dev runner: loads ../../.env (shared with the API) and starts `next dev` on WEB_PORT.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync("../../.env")) process.loadEnvFile("../../.env");
const port = process.env.WEB_PORT ?? "3000";
const child = spawn("pnpm", ["exec", "next", "dev", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
