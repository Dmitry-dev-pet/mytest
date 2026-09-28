import {
  HttpError,
  getHeader,
  parseBody,
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  CODEX_HOME,
  REPO_DIR,
  REPO_URL,
  getResearchSandbox
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

askpass="$(mktemp)"
cleanup() {
  rm -f "$askpass"
}
trap cleanup EXIT

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
fi

exec bash "$repo/vercel-hobby/runner/run-stage.sh"
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
      (mode === "derive" || mode === "compute" || mode === "review") &&
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
        REPO_DIR,
        REPO_URL
      }
    });

    const session = sandbox.currentSession();

    res.status(202).json({
      ok: true,
      sandbox: sandbox.name,
      sessionId: session.sessionId,
      cmdId: command.cmdId,
      mode
    });
  } catch (error) {
    sendError(res, error);
  }
}
