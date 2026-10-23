import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
  ],
  { stdio: "inherit", env: { ...process.env, PULSO_PREVIEW: "1" } },
);
child.on("exit", (code) => process.exit(code ?? 1));
