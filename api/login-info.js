import {
  requireMonitorToken,
  sendError
} from "../lib/auth.js";
import {
  LOGIN_LOG,
  MONITOR_AUTH,
  getExistingResearchSandbox
} from "../lib/sandbox.js";

const READ_LOGIN = String.raw`set -euo pipefail
if [[ -f "$LOGIN_LOG" ]]; then
  tail -c 12000 "$LOGIN_LOG"
fi
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
      args: ["-lc", READ_LOGIN],
      env: { LOGIN_LOG }
    });
    const log = await result.stdout();

    res.status(200).json({ ok: true, log });
  } catch (error) {
    sendError(res, error);
  }
}
