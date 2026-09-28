import {
  createMonitorCredential,
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  CODEX_HOME,
  CONTROL_DIR,
  LOGIN_LOG,
  getResearchSandbox,
  installMonitorCredential
} from "../lib/sandbox.js";

const PREPARE = String.raw`set -euo pipefail
export CODEX_HOME="$CODEX_HOME"
tools="/home/vercel-sandbox/.physics-tools"
mkdir -p "$CODEX_HOME" "$CONTROL_DIR" "$tools"

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
codex login status 2>&1 || true
`;

const LOGIN = String.raw`set -euo pipefail
export CODEX_HOME="$CODEX_HOME"
tools="/home/vercel-sandbox/.physics-tools"
mkdir -p "$CODEX_HOME" "$CONTROL_DIR" "$tools"
rm -f "$LOGIN_LOG"
: > "$LOGIN_LOG"
exec >>"$LOGIN_LOG" 2>&1
export PATH="$tools/node_modules/.bin:$PATH"
codex --version
exec codex login --device-auth
`;

export default async function handler(req, res) {
  try {
    requirePost(req);
    await requireGitHubOidc(req);

    const sandbox = await getResearchSandbox();
    const monitor = createMonitorCredential();
    await installMonitorCredential(
      sandbox,
      monitor.digest,
      monitor.expiresAt
    );

    const prepare = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", PREPARE],
      env: { CODEX_HOME, CONTROL_DIR }
    });
    const prepareOutput = await prepare.stdout();
    const alreadyAuthenticated =
      /logged in.*chatgpt|chatgpt.*logged in/i.test(prepareOutput);

    const session = sandbox.currentSession();

    if (alreadyAuthenticated) {
      return res.status(200).json({
        ok: true,
        sandbox: sandbox.name,
        sessionId: session.sessionId,
        cmdId: null,
        monitorToken: monitor.token,
        monitorExpiresAt: monitor.expiresAt,
        mode: "login",
        alreadyAuthenticated: true
      });
    }

    const command = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", LOGIN],
      detached: true,
      env: { CODEX_HOME, CONTROL_DIR, LOGIN_LOG }
    });

    res.status(202).json({
      ok: true,
      sandbox: sandbox.name,
      sessionId: session.sessionId,
      cmdId: command.cmdId,
      monitorToken: monitor.token,
      monitorExpiresAt: monitor.expiresAt,
      mode: "login",
      alreadyAuthenticated: false
    });
  } catch (error) {
    sendError(res, error);
  }
}
