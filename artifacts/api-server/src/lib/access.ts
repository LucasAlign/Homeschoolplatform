import type { RequestHandler } from "express";

// This is an explicit local fixture boundary, NOT authentication.
export function syntheticConfiguration(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") return false;
  if (env.SYNTHETIC_DATA_ONLY !== "true") return false;
  try {
    const db = new URL(env.DATABASE_URL ?? "");
    return (
      db.protocol === "postgresql:" &&
      db.hostname === "127.0.0.1" &&
      /^\/homeschool_synthetic(?:_[a-z0-9]+)?$/.test(db.pathname) &&
      !db.search
    );
  } catch {
    return false;
  }
}

export const requireLocalSynthetic: RequestHandler = (req, res, next) => {
  if (!syntheticConfiguration(process.env)) {
    res.status(503).json({
      error:
        "Production access is disabled. Configure an isolated local synthetic-data environment to continue.",
    });
    return;
  }
  const remote = req.socket.remoteAddress;
  const host = req.headers.host ?? "";
  const origin = req.headers.origin;
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote ?? "") ||
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
    (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) ||
    req.headers["sec-fetch-site"] === "cross-site"
  ) {
    res
      .status(403)
      .json({ error: "Synthetic development access is local only." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
};
