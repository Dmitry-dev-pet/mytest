import {
  requireGitHubOidc,
  requirePost,
  sendError
} from "../lib/auth.js";
import { stopResearchSandbox } from "../lib/sandbox.js";

export default async function handler(req, res) {
  try {
    requirePost(req);
    await requireGitHubOidc(req);
    await stopResearchSandbox();
    res.status(200).json({ ok: true, stopped: true });
  } catch (error) {
    sendError(res, error);
  }
}
