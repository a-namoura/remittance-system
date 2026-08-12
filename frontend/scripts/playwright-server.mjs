import { spawn } from "node:child_process";

const vite = "./node_modules/vite/bin/vite.js";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vite, ...args], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Vite exited with ${code}.`))));
  });
}

await run(["build"]);

const preview = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", "4174"], {
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => preview.kill(signal));
}

preview.once("exit", (code) => process.exit(code ?? 0));
