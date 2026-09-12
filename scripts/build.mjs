import { spawnSync } from "node:child_process";

// The root command loads .env once so Expo receives the public API origin too.
for (const workspace of ["@fp/api", "@fp/mobile"]) {
  const result = spawnSync("npm", ["run", "build", "-w", workspace], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    process.stderr.write(`Could not start the build for ${workspace}. Check that npm is installed and available.\n`);
    process.exitCode = 1;
    break;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
