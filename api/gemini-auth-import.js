import {
  HttpError,
  parseBody,
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  GEMINI_CLI_HOME,
  getResearchSandbox
} from "../lib/sandbox.js";

const WRITE_CREDS = String.raw`set -euo pipefail
dir="$GEMINI_CLI_HOME/.gemini"
mkdir -p "$dir"
umask 077
printf '%s' "$GEMINI_OAUTH_JSON" > "$dir/oauth_creds.json"
cat > "$dir/settings.json" <<'JSON'
{
  "security": {
    "auth": {
      "selectedType": "oauth-personal"
    },
    "toolSandboxing": false
  },
  "general": {
    "enableAutoUpdate": false,
    "enableAutoUpdateNotification": false
  }
}
JSON
chmod 600 "$dir/oauth_creds.json" "$dir/settings.json"
`;

export default async function handler(req, res) {
  try {
    requirePost(req);
    await requireGitHubOidc(req);

    const body = parseBody(req);
    const encoded =
      typeof body.oauthCredsB64 === "string" ? body.oauthCredsB64.trim() : "";

    if (encoded.length < 100 || encoded.length > 50000) {
      throw new HttpError(400, "invalid Gemini OAuth credential payload");
    }

    let jsonText;
    try {
      jsonText = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      throw new HttpError(400, "Gemini OAuth credential is not valid base64");
    }

    let credential;
    try {
      credential = JSON.parse(jsonText);
    } catch {
      throw new HttpError(400, "Gemini OAuth credential is not valid JSON");
    }

    if (
      !credential ||
      typeof credential !== "object" ||
      Array.isArray(credential) ||
      (typeof credential.refresh_token !== "string" &&
        typeof credential.access_token !== "string")
    ) {
      throw new HttpError(400, "Gemini OAuth credential has unexpected shape");
    }

    const sandbox = await getResearchSandbox();
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", WRITE_CREDS],
      env: {
        GEMINI_CLI_HOME,
        GEMINI_OAUTH_JSON: jsonText
      }
    });

    if (result.exitCode !== 0) {
      throw new HttpError(500, "failed to persist Gemini OAuth credential");
    }

    res.status(200).json({
      ok: true,
      imported: true,
      path: "$GEMINI_CLI_HOME/.gemini/oauth_creds.json"
    });
  } catch (error) {
    sendError(res, error);
  }
}
