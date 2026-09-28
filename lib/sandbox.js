import { Sandbox } from "@vercel/sandbox";

export const SANDBOX_NAME = "rubik-physics-intern-hobby";
export const CODEX_HOME = "/home/vercel-sandbox/.codex-physics";
export const REPO_DIR = "/home/vercel-sandbox/rubik-physics-intern";
export const REPO_URL =
  "https://github.com/Dmitry-dev-pet/rubik-physics-intern.git";

export const CONTROL_DIR = "/home/vercel-sandbox/.physics-control";
export const LOGIN_LOG = CONTROL_DIR + "/login.log";
export const RUN_LOG = CONTROL_DIR + "/run.log";
export const RUN_STATUS = CONTROL_DIR + "/run-status";
export const RUN_EXIT = CONTROL_DIR + "/run-exit";
export const MONITOR_AUTH = CONTROL_DIR + "/monitor-auth";
export const GEMINI_CLI_HOME = "/home/vercel-sandbox/.gemini-home";

const SESSION_TIMEOUT_MS = 40 * 60 * 1000;
const SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function applyHobbyConfig(sandbox) {
  await sandbox.update({
    resources: { vcpus: 2 },
    timeout: SESSION_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: SNAPSHOT_TTL_MS,
    keepLastSnapshots: {
      count: 2,
      expiration: SNAPSHOT_TTL_MS,
      deleteEvicted: true
    },
    tags: {
      app: "physics-intern",
      tier: "hobby"
    }
  });
}

export async function getResearchSandbox() {
  const sandbox = await Sandbox.getOrCreate({
    name: SANDBOX_NAME,
    resume: true,
    onCreate: applyHobbyConfig,
    onResume: applyHobbyConfig
  });

  await applyHobbyConfig(sandbox);
  return sandbox;
}

export async function getExistingResearchSandbox() {
  return await Sandbox.get({
    name: SANDBOX_NAME
  });
}

export async function installMonitorCredential(
  sandbox,
  digest,
  expiresAt
) {
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      'set -euo pipefail; mkdir -p "$CONTROL_DIR"; umask 077; printf "%s %s\n" "$MONITOR_DIGEST" "$MONITOR_EXPIRES_AT" > "$MONITOR_AUTH"',
    ],
    env: {
      CONTROL_DIR,
      MONITOR_AUTH,
      MONITOR_DIGEST: digest,
      MONITOR_EXPIRES_AT: String(expiresAt),
    },
  });

  if (result.exitCode !== 0) {
    throw new Error("failed to install monitor credential");
  }
}
