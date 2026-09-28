import { HttpError } from "./auth.js";

function oidcToken() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    throw new HttpError(500, "Vercel OIDC token is unavailable");
  }
  return token;
}

export async function vercelApi(path, init = {}) {
  const response = await fetch("https://api.vercel.com" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + oidcToken(),
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      "Vercel Sandbox API request failed"
    );
  }

  return response;
}

export function requireSandboxId(value, prefix) {
  if (
    typeof value !== "string" ||
    !new RegExp("^" + prefix + "_[A-Za-z0-9]+$").test(value)
  ) {
    throw new HttpError(400, "invalid sandbox identifier");
  }
  return value;
}
