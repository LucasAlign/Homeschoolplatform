import { Router, type RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod/v4";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  familiesTable,
  membersTable,
  credentialsTable,
  sessionsTable,
  studentsTable,
  loginLimitsTable,
} from "@workspace/db";
import {
  csrfFor,
  digest,
  hashPassword,
  verifyPassword,
} from "../lib/passwords";
import {
  cookieName,
  cookieOptions,
  familyMode,
  readSession,
  sessionToken,
  requireSession,
  requireParent,
  principal,
} from "../lib/session";

const router = Router();
const credentials = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    password: z.string().min(15).max(128),
  })
  .strict();
const loginInput = credentials.extend({ password: z.string().min(1).max(128) });
const signup = credentials.extend({ name: z.string().trim().min(1).max(100) });
const authWrites: RequestHandler = (req, res, next) => {
  // Non-simple header plus strict same-origin check prevents login/signup CSRF, too.
  if (
    !familyMode() ||
    req.get("X-Requested-With") !== "AnchorOne" ||
    (req.get("Origin") &&
      req.get("Origin") !==
        (process.env.LOCAL_APP_ORIGIN ?? "http://127.0.0.1:3000"))
  ) {
    res.status(403).json({ error: "Authentication request is not permitted." });
    return;
  }
  next();
};
async function throttled(key: string, limit: number) {
  const now = new Date();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [value] = await db
    .insert(loginLimitsTable)
    .values({ key: digest(key), attempts: 1, windowStart: now })
    .onConflictDoUpdate({
      target: loginLimitsTable.key,
      set: {
        attempts: sql`CASE WHEN ${loginLimitsTable.windowStart} < ${cutoff} THEN 1 ELSE ${loginLimitsTable.attempts} + 1 END`,
        windowStart: sql`CASE WHEN ${loginLimitsTable.windowStart} < ${cutoff} THEN ${now} ELSE ${loginLimitsTable.windowStart} END`,
      },
    })
    .returning();
  return value.attempts > limit;
}
router.get("/auth/session", async (req, res) => {
  const user = familyMode() ? await readSession(req) : null;
  res.json({
    mode: process.env.AUTH_MODE ?? "unconfigured",
    user,
    csrfToken: user ? csrfFor(sessionToken(req)!) : null,
    allowSignup: familyMode() && process.env.LOCAL_FAMILY_SIGNUP === "true",
  });
});
router.post("/auth/register", authWrites, async (req, res) => {
  if (process.env.LOCAL_FAMILY_SIGNUP !== "true") {
    res.status(403).json({ error: "Local family registration is disabled." });
    return;
  }
  const parsed = signup.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error:
          "Use a name, a 3–64 character username and a 15–128 character password.",
      });
    return;
  }
  if (await throttled("register:" + req.socket.remoteAddress, 10)) {
    res
      .status(429)
      .json({ error: "Please wait before creating another account." });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await db.transaction(async (tx) => {
      const userId = nanoid(),
        familyId = nanoid();
      await tx
        .insert(usersTable)
        .values({
          id: userId,
          name: parsed.data.name,
          email: `${userId}@accounts.invalid`,
        });
      await tx.insert(familiesTable).values({ id: familyId, ownerId: userId });
      await tx
        .insert(membersTable)
        .values({ userId, familyId, role: "parent" });
      await tx
        .insert(credentialsTable)
        .values({ userId, username: parsed.data.username, passwordHash });
    });
  } catch (error) {
    if (
      (error as { cause?: { code?: string }; code?: string }).cause?.code !==
        "23505" &&
      (error as { code?: string }).code !== "23505"
    )
      throw error;
    res.status(409).json({ error: "That username cannot be used." });
    return;
  }
  res
    .status(201)
    .json({ message: "Family account created. Sign in to continue." });
});
router.post("/auth/login", authWrites, async (req, res) => {
  const parsed = loginInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }
  const ipLimited = await throttled("login-ip:" + req.socket.remoteAddress, 40);
  const userLimited = await throttled("login-user:" + parsed.data.username, 8);
  if (ipLimited || userLimited) {
    res
      .status(429)
      .json({ error: "Too many attempts. Try again in 15 minutes." });
    return;
  }
  const [record] = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.username, parsed.data.username));
  if (!(await verifyPassword(parsed.data.password, record?.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }
  const token = randomBytes(32).toString("hex");
  const oldToken = sessionToken(req);
  const issued = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(credentialsTable)
      .where(eq(credentialsTable.userId, record.userId))
      .for("update");
    if (!current || current.passwordHash !== record.passwordHash) return false;
    if (oldToken)
      await tx
        .delete(sessionsTable)
        .where(eq(sessionsTable.tokenHash, digest(oldToken)));
    await tx
      .insert(sessionsTable)
      .values({
        tokenHash: digest(token),
        userId: record.userId,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      });
    await tx
      .delete(loginLimitsTable)
      .where(
        eq(loginLimitsTable.key, digest("login-user:" + parsed.data.username)),
      );
    return true;
  });
  if (!issued) {
    res.status(401).json({ error: "Credentials changed. Sign in again." });
    return;
  }
  res.cookie(cookieName, token, {
    ...cookieOptions(),
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ csrfToken: csrfFor(token) });
});
router.post("/auth/logout", requireSession, async (req, res) => {
  const token = sessionToken(req);
  if (token)
    await db
      .delete(sessionsTable)
      .where(eq(sessionsTable.tokenHash, digest(token)));
  res.clearCookie(cookieName, cookieOptions());
  res.sendStatus(204);
});
router.post(
  "/auth/children/:studentId",
  requireSession,
  requireParent,
  async (req, res) => {
    if (!familyMode()) {
      res.status(409).json({ error: "Child accounts require family mode." });
      return;
    }
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error:
            "Use a 3–64 character username and a 15–128 character password.",
        });
      return;
    }
    const [child] = await db
      .select()
      .from(studentsTable)
      .where(
        and(
          eq(studentsTable.id, String(req.params.studentId)),
          eq(studentsTable.ownerId, principal(res).ownerId),
        ),
      );
    if (!child) {
      res.status(404).json({ error: "Student not found" });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      await db.transaction(async (tx) => {
        const userId = nanoid();
        await tx
          .insert(usersTable)
          .values({
            id: userId,
            name: child.preferredName || child.firstName,
            email: `${userId}@accounts.invalid`,
          });
        await tx
          .insert(membersTable)
          .values({
            userId,
            familyId: principal(res).familyId,
            role: "student",
            studentId: child.id,
          });
        await tx
          .insert(credentialsTable)
          .values({ userId, username: parsed.data.username, passwordHash });
      });
    } catch (error) {
      if (
        (error as { cause?: { code?: string }; code?: string }).cause?.code !==
          "23505" &&
        (error as { code?: string }).code !== "23505"
      )
        throw error;
      res
        .status(409)
        .json({ error: "A login already exists for this child or username." });
      return;
    }
    res.status(201).json({ message: "Child login created." });
  },
);
router.post("/auth/password", requireSession, async (req, res) => {
  const parsed = z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(15).max(128),
    })
    .strict()
    .safeParse(req.body);
  if (!familyMode() || !parsed.success) {
    res
      .status(400)
      .json({
        error: "Password change requires a family session and valid passwords.",
      });
    return;
  }
  if (await throttled("password:" + principal(res).userId, 8)) {
    res.status(429).json({ error: "Too many attempts." });
    return;
  }
  const [record] = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.userId, principal(res).userId));
  if (
    !(await verifyPassword(parsed.data.currentPassword, record?.passwordHash))
  ) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const changed = await db.transaction(async (tx) => {
    const updated = await tx
      .update(credentialsTable)
      .set({ passwordHash })
      .where(
        and(
          eq(credentialsTable.userId, principal(res).userId),
          eq(credentialsTable.passwordHash, record.passwordHash),
        ),
      )
      .returning({ userId: credentialsTable.userId });
    if (!updated.length) return false;
    await tx
      .delete(sessionsTable)
      .where(eq(sessionsTable.userId, principal(res).userId));
    return true;
  });
  if (!changed) {
    res.status(409).json({ error: "Credentials changed. Sign in again." });
    return;
  }
  res.clearCookie(cookieName, cookieOptions());
  res.sendStatus(204);
});
export default router;
