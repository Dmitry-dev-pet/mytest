import {
  requireMonitorToken,
  sendError
} from "../lib/auth.js";
import {
  MONITOR_AUTH,
  RUN_EXIT,
  RUN_STATUS,
  getExistingResearchSandbox
} from "../lib/sandbox.js";

const READ_STATUS = String.raw`set -euo pipefail
state="$(cat "$RUN_STATUS" 2>/dev/null || printf '%s' 'unknown')"
exit_code="$(cat "$RUN_EXIT" 2>/dev/null || true)"
printf 'state=%s\n' "$state"
printf 'exit=%s\n' "$exit_code"
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
      args: ["-lc", READ_STATUS],
      env: { RUN_EXIT, RUN_STATUS }
    });
    const text = await result.stdout();

    const values = Object.fromEntries(
      text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return index === -1
            ? [line, ""]
            : [line.slice(0, index), line.slice(index + 1)];
        })
    );

    res.status(200).json({
      ok: true,
      state: values.state || "unknown",
      exitCode: values.exit === "" ? null : Number(values.exit)
    });
  } catch (error) {
    sendError(res, error);
  }
}
