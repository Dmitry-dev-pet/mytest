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
      return res.status(405).send("GET required");
    }
    await requireGitHubOidc(req);

    const sessionId = requireSandboxId(req.query.sessionId, "sbx");
    const cmdId = requireSandboxId(req.query.cmdId, "cmd");

    const response = await vercelApi(
      "/v2/sandboxes/sessions/" +
        encodeURIComponent(sessionId) +
        "/cmd/" +
        encodeURIComponent(cmdId) +
        "/logs"
    );

    const text = await response.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(text.slice(-50000));
  } catch (error) {
    sendError(res, error);
  }
}
