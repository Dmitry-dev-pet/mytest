import {
  requireMonitorToken,
  sendError
} from "../lib/auth.js";
import {
  CODEX_HOME,
  MONITOR_AUTH,
  getExistingResearchSandbox
} from "../lib/sandbox.js";

const CHECK_LOGIN = String.raw`set -euo pipefail
export CODEX_HOME="$CODEX_HOME"
tools="/home/vercel-sandbox/.physics-tools"
export PATH="$tools/node_modules/.bin:$PATH"
codex login status 2>&1 || true
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "GET required" });
    }

    const sandbox = await getExistingResearchSandbox();
    await requireMonitorToken(req, sandbox, MONITOR_AUTH);

    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", CHECK_LOGIN],
      env: { CODEX_HOME }
    });
    const status = await result.stdout();
    const authenticated = /logged in.*chatgpt|chatgpt.*logged in/i.test(status);

    res.status(200).json({ ok: true, authenticated, status });
  } catch (error) {
    sendError(res, error);
  }
}
