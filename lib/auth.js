import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "vercel-physics-intern-hobby";
const REPOSITORY = "Dmitry-dev-pet/rubik-physics-intern";
const ACTOR = "Dmitry-dev-pet";
const WORKFLOW_REF =
  REPOSITORY +
  "/.github/workflows/physics-intern-hobby.yml@refs/heads/main";

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
  if (payload.workflow_ref !== WORKFLOW_REF) {
    throw new HttpError(403, "workflow not allowed");
  }

  return payload;
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
