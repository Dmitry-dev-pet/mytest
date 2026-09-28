import {
  requireGitHubOidc,
  sendError
} from "../lib/auth.js";
import {
  RUN_LOG,
  getExistingResearchSandbox
} from "../lib/sandbox.js";

const READ_LOGS = String.raw`set -euo pipefail
if [[ -f "$RUN_LOG" ]]; then
  tail -c 50000 "$RUN_LOG"
fi
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("GET required");
    }
    await requireGitHubOidc(req);

    const sandbox = await getExistingResearchSandbox();
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", READ_LOGS],
      env: { RUN_LOG }
    });
    const text = await result.stdout();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(text);
  } catch (error) {
    sendError(res, error);
  }
}
