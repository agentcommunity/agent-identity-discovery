import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const python = process.env.PYTHON ?? "python3";
const venvDir = mkdtempSync(join(tmpdir(), "aid-py-parity-"));
const pipCacheDir = mkdtempSync(join(tmpdir(), "aid-py-parity-pip-cache-"));
const venvPython = join(venvDir, "bin", "python");
const commandEnv = {
  ...process.env,
  PIP_CACHE_DIR: pipCacheDir,
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
};
let failed = false;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: commandEnv,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    failed = true;
    process.exitCode = result.status ?? 1;
    return false;
  }

  return true;
}

try {
  if (run(python, ["-m", "venv", venvDir])) {
    if (
      run(venvPython, ["-m", "pip", "install", "pip>=21.3", "setuptools>=64", "wheel"]) &&
      run(venvPython, ["-m", "pip", "install", "-e", "packages/aid-py[dev,pka]"])
    ) {
      run(venvPython, ["-m", "pytest", "packages/aid-py"]);
    }
  }
} finally {
  rmSync(venvDir, { recursive: true, force: true });
  rmSync(pipCacheDir, { recursive: true, force: true });
}

if (failed) {
  process.exit(process.exitCode);
}
