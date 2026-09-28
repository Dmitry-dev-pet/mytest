import {
  requireGitHubOidc,
  sendError
} from "../lib/auth.js";
import {
  requireSandboxId,
  vercelApi
} from "../lib/vercel-api.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "GET required" });
    }
    await requireGitHubOidc(req);

    const sessionId = requireSandboxId(req.query.sessionId, "sbx");
    const cmdId = requireSandboxId(req.query.cmdId, "cmd");

    const response = await vercelApi(
      "/v2/sandboxes/sessions/" +
        encodeURIComponent(sessionId) +
        "/cmd/" +
        encodeURIComponent(cmdId)
    );
    const payload = await response.json();

    res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    sendError(res, error);
  }
}
