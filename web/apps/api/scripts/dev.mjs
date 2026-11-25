// Dev runner: TypeScript in watch mode + Node restarting on every successful compile.
// Loads ../../.env when present (Node's --env-file-if-exists).
import { spawn } from "node:child_process";

const opts = { stdio: "inherit", shell: process.platform === "win32" };
const tsc = spawn("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], opts);
const node = spawn(
  process.execPath,
  ["--env-file-if-exists=../../.env", "--watch-path=dist", "--watch-preserve-output", "dist/main.js"],
  opts,
);

const stop = () => {
  tsc.kill();
  node.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
tsc.on("exit", stop);
node.on("exit", stop);
