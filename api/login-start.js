import {
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  CODEX_HOME,
  CONTROL_DIR,
  LOGIN_LOG,
  getResearchSandbox
} from "../lib/sandbox.js";

const LOGIN = String.raw`set -euo pipefail
export CODEX_HOME="$CODEX_HOME"
tools="/home/vercel-sandbox/.physics-tools"
mkdir -p "$CODEX_HOME" "$CONTROL_DIR" "$tools"
rm -f "$LOGIN_LOG"
: > "$LOGIN_LOG"
exec >>"$LOGIN_LOG" 2>&1

wanted="codex-cli 0.157.0"
current=""
if [[ -x "$tools/node_modules/.bin/codex" ]]; then
  current="$("$tools/node_modules/.bin/codex" --version 2>/dev/null || true)"
fi

if [[ "$current" != "$wanted" ]]; then
  npm install --prefix "$tools" --no-audit --no-fund @openai/codex@0.157.0
fi

export PATH="$tools/node_modules/.bin:$PATH"
codex --version
exec codex login --device-auth
`;

export default async function handler(req, res) {
  try {
    requirePost(req);
    await requireGitHubOidc(req);

    const sandbox = await getResearchSandbox();
    const command = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", LOGIN],
      detached: true,
      env: { CODEX_HOME, CONTROL_DIR, LOGIN_LOG }
    });

    const session = sandbox.currentSession();

    res.status(202).json({
      ok: true,
      sandbox: sandbox.name,
      sessionId: session.sessionId,
      cmdId: command.cmdId,
      mode: "login"
    });
  } catch (error) {
    sendError(res, error);
  }
}
