import {
  HttpError,
  createMonitorCredential,
  getHeader,
  parseBody,
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  CODEX_HOME,
  CONTROL_DIR,
  REPO_DIR,
  REPO_URL,
  RUN_EXIT,
  RUN_LOG,
  RUN_STATUS,
  getResearchSandbox,
  installMonitorCredential
} from "../lib/sandbox.js";

const MODES = new Set([
  "survey",
  "research-plan",
  "derive",
  "compute",
  "review",
  "critique",
  "finalize"
]);

const LAUNCHER = String.raw`set -euo pipefail
repo="$REPO_DIR"
mkdir -p "$CONTROL_DIR"
rm -f "$RUN_EXIT"
printf '%s\n' 'running' > "$RUN_STATUS"
: > "$RUN_LOG"
exec >>"$RUN_LOG" 2>&1

askpass="$(mktemp)"
finish() {
  rc=$?
  rm -f "$askpass"
  printf '%s\n' "$rc" > "$RUN_EXIT"
  printf '%s\n' 'finished' > "$RUN_STATUS"
}
trap finish EXIT

cat > "$askpass" <<'EOS'
#!/usr/bin/env bash
case "\${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *) printf '%s\n' "$GITHUB_TOKEN" ;;
esac
EOS
chmod 0700 "$askpass"

if [[ ! -d "$repo/.git" ]]; then
  mkdir -p "$(dirname "$repo")"
  GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
    git clone "$REPO_URL" "$repo"
else
  GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
    git -C "$repo" fetch origin main
  git -C "$repo" reset --hard origin/main
  git -C "$repo" clean -fd
fi

bash "$repo/vercel-hobby/runner/run-stage.sh"
`;

export default async function handler(req, res) {
  try {
    requirePost(req);
    await requireGitHubOidc(req);

    const body = parseBody(req);
    const mode = typeof body.mode === "string" ? body.mode : "";
    const task = typeof body.task === "string" ? body.task : "";
    const githubRunId =
      typeof body.githubRunId === "string" ? body.githubRunId : "unknown";

    if (!MODES.has(mode)) {
      throw new HttpError(400, "unsupported Hobby research mode");
    }
    if (
      ["derive", "compute", "review"].includes(mode) &&
      !task.trim()
    ) {
      throw new HttpError(400, "this mode requires a task");
    }
    if (task.length > 8000) {
      throw new HttpError(400, "task is too large");
    }

    const githubToken = getHeader(req, "x-github-token");
    if (githubToken.length < 20 || githubToken.length > 2048) {
      throw new HttpError(400, "invalid ephemeral GitHub token");
    }

    const sandbox = await getResearchSandbox();
    const monitor = createMonitorCredential();
    await installMonitorCredential(
      sandbox,
      monitor.digest,
      monitor.expiresAt
    );

    const command = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", LAUNCHER],
      detached: true,
      env: {
        GITHUB_TOKEN: githubToken,
        GITHUB_RUN_ID: githubRunId,
        MODE: mode,
        TASK: task,
        CODEX_HOME,
        CONTROL_DIR,
        REPO_DIR,
        REPO_URL,
        RUN_EXIT,
        RUN_LOG,
        RUN_STATUS
      }
    });

    const session = sandbox.currentSession();

    res.status(202).json({
      ok: true,
      sandbox: sandbox.name,
      sessionId: session.sessionId,
      cmdId: command.cmdId,
      monitorToken: monitor.token,
      monitorExpiresAt: monitor.expiresAt,
      mode
    });
  } catch (error) {
    sendError(res, error);
  }
}
