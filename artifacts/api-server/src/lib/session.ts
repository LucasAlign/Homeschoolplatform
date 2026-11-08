import type { Request, RequestHandler, Response } from "express";
import {
  db,
  sessionsTable,
  membersTable,
  familiesTable,
  studentsTable,
} from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { csrfFor, digest, equalSecret } from "./passwords";
import { DEMO_USER_ID, ensureDemoUser } from "./user";

export type Principal = {
  userId: string;
  ownerId: string;
  familyId: string;
  role: "parent" | "student";
  studentId: string | null;
  mode: "family" | "synthetic";
};
export const principal = (res: Response): Principal => res.locals.principal;
export const familyMode = () => process.env.AUTH_MODE === "family";
export const cookieName = "anchor_session";
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api",
});
export function sessionToken(req: Request) {
  const values = (req.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith(cookieName + "="));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function readSession(req: Request): Promise<Principal | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const [record] = await db
    .select({ member: membersTable, family: familiesTable })
    .from(sessionsTable)
    .innerJoin(membersTable, eq(sessionsTable.userId, membersTable.userId))
    .innerJoin(familiesTable, eq(membersTable.familyId, familiesTable.id))
    .where(
      and(
        eq(sessionsTable.tokenHash, digest(token)),
        gt(sessionsTable.expiresAt, new Date()),
        gt(sessionsTable.lastSeenAt, new Date(Date.now() - 30 * 60 * 1000)),
      ),
    );
  if (!record) return null;
  const { member, family } = record;
  if (member.role === "student") {
    const [child] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(
        and(
          eq(studentsTable.id, member.studentId!),
          eq(studentsTable.ownerId, family.ownerId),
        ),
      );
    if (!child) return null;
  } else if (member.role !== "parent") return null;
  await db
    .update(sessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessionsTable.tokenHash, digest(token)));
  return {
    userId: member.userId,
    ownerId: family.ownerId,
    familyId: family.id,
    role: member.role,
    studentId: member.studentId,
    mode: "family",
  };
}
export const requireSession: RequestHandler = async (req, res, next) => {
  if (!familyMode()) {
    if (process.env.AUTH_MODE !== "synthetic") {
      res
        .status(503)
        .json({
          error:
            "Choose AUTH_MODE=family for verified sessions or AUTH_MODE=synthetic for the explicit fixture demo.",
        });
      return;
    }
    await ensureDemoUser();
    res.locals.principal = {
      userId: DEMO_USER_ID,
      ownerId: DEMO_USER_ID,
      familyId: "synthetic",
      role: "parent",
      studentId: null,
      mode: "synthetic",
    } satisfies Principal;
  } else {
    const user = await readSession(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    res.locals.principal = user;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !equalSecret(req.get("X-CSRF-Token") ?? "", csrfFor(sessionToken(req)!))
    ) {
      res
        .status(403)
        .json({ error: "Refresh your session before saving changes." });
      return;
    }
  }
  next();
};
export const requireParent: RequestHandler = (_req, res, next) => {
  if (principal(res).role !== "parent") {
    res.status(403).json({ error: "A parent account is required." });
    return;
  }
  next();
};
export function canAccessChild(res: Response, id: string) {
  const user = principal(res);
  return user.role === "parent" || user.studentId === id;
}
