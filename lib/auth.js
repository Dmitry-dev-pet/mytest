import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "vercel-physics-intern-hobby";
const REPOSITORY = "Dmitry-dev-pet/rubik-physics-intern";
const ACTOR = "Dmitry-dev-pet";
const ALLOWED_WORKFLOW_REFS = new Set([
  REPOSITORY +
    "/.github/workflows/physics-intern-hobby.yml@refs/heads/main",
  REPOSITORY +
    "/.github/workflows/gemini-auth.yml@refs/heads/main"
]);

const MONITOR_TTL_MS = 45 * 60 * 1000;

const JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
);

export async function requireGitHubOidc(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new HttpError(401, "missing GitHub OIDC token");
  }

  const token = header.slice("Bearer ".length);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (payload.repository !== REPOSITORY) {
    throw new HttpError(403, "repository not allowed");
  }
  if (payload.actor !== ACTOR) {
    throw new HttpError(403, "actor not allowed");
  }
  if (!ALLOWED_WORKFLOW_REFS.has(payload.workflow_ref)) {
    throw new HttpError(403, "workflow not allowed");
  }

  return payload;
}

export function createMonitorCredential() {
  const token = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(token).digest("hex");
  return {
    token,
    digest,
    expiresAt: Date.now() + MONITOR_TTL_MS,
  };
}

export async function requireMonitorToken(req, sandbox, monitorAuthPath) {
  const token = getHeader(req, "x-monitor-token");
  if (token.length < 32 || token.length > 256) {
    throw new HttpError(401, "missing or invalid monitor token");
  }

  const read = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      'if [[ -f "$MONITOR_AUTH" ]]; then cat "$MONITOR_AUTH"; fi',
    ],
    env: { MONITOR_AUTH: monitorAuthPath },
  });
  const raw = (await read.stdout()).trim();
  const [expectedDigest, expiresAtText] = raw.split(" ", 2);
  const expiresAt = Number(expiresAtText);

  if (
    !/^[a-f0-9]{64}$/.test(expectedDigest || "") ||
    !Number.isFinite(expiresAt) ||
    Date.now() >= expiresAt
  ) {
    throw new HttpError(401, "monitor token expired or unavailable");
  }

  const actualDigest = createHash("sha256").update(token).digest("hex");
  const actual = Buffer.from(actualDigest, "hex");
  const expected = Buffer.from(expectedDigest, "hex");

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new HttpError(403, "monitor token rejected");
  }
}

export async function requireGitHubRunToken(req) {
  const token = getHeader(req, "x-github-token");
  const runId = getHeader(req, "x-github-run-id");

  if (token.length < 20 || token.length > 2048 || !/^\d+$/.test(runId)) {
    throw new HttpError(401, "missing or invalid GitHub run credential");
  }

  const response = await fetch(
    "https://api.github.com/repos/" +
      REPOSITORY +
      "/actions/runs/" +
      encodeURIComponent(runId),
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "physics-intern-hobby-controller"
      }
    }
  );

  if (!response.ok) {
    throw new HttpError(403, "GitHub run credential rejected");
  }

  const run = await response.json();
  if (
    run?.repository?.full_name !== REPOSITORY ||
    run?.actor?.login !== ACTOR ||
    run?.path !== ".github/workflows/physics-intern-hobby.yml" ||
    !["queued", "in_progress"].includes(run?.status)
  ) {
    throw new HttpError(403, "GitHub run is not allowed");
  }

  return run;
}

export async function requireRunAccess(req, sandbox, monitorAuthPath) {
  const githubToken = getHeader(req, "x-github-token");
  const runId = getHeader(req, "x-github-run-id");

  if (githubToken && runId) {
    return await requireGitHubRunToken(req);
  }

  return await requireMonitorToken(req, sandbox, monitorAuthPath);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : "";
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HttpError(400, "invalid JSON body");
    }
  }
  return req.body;
}

export function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof HttpError ? error.message : "internal controller error";
  res.status(status).json({ ok: false, error: message });
}

export function requirePost(req) {
  if (req.method !== "POST") {
    throw new HttpError(405, "POST required");
  }
}
