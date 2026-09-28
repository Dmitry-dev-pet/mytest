import {
  requireGitHubOidc,
  sendError
} from "../lib/auth.js";
import {
  GEMINI_CLI_HOME,
  getResearchSandbox
} from "../lib/sandbox.js";

const CHECK = String.raw`set -euo pipefail
file="$GEMINI_CLI_HOME/.gemini/oauth_creds.json"
if [[ -s "$file" ]]; then
  printf '%s\n' present
else
  printf '%s\n' missing
fi
`;

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "GET required" });
    }
    await requireGitHubOidc(req);

    const sandbox = await getResearchSandbox();
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", CHECK],
      env: { GEMINI_CLI_HOME }
    });
    const status = (await result.stdout()).trim();

    res.status(200).json({
      ok: true,
      credentialPresent: status === "present"
    });
  } catch (error) {
    sendError(res, error);
  }
}
