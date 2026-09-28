import {
  requireRunAccess,
  requirePost,
  sendError
} from "../lib/auth.js";
import {
  MONITOR_AUTH,
  getExistingResearchSandbox
} from "../lib/sandbox.js";

export default async function handler(req, res) {
  try {
    requirePost(req);

    const sandbox = await getExistingResearchSandbox();
    await requireRunAccess(req, sandbox, MONITOR_AUTH);
    await sandbox.stop();

    res.status(200).json({ ok: true, stopped: true });
  } catch (error) {
    sendError(res, error);
  }
}
