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

export async function stopResearchSandbox() {
  const sandbox = await Sandbox.get({
    name: SANDBOX_NAME,
    resume: false
  });
  await sandbox.stop();
}
