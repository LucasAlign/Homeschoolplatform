import { db } from "@/lib/db";

// Phase 1 has no auth yet (Phase 8). Every request runs as a single seeded
// "current user". Centralizing it here means swapping in real auth later is a
// one-file change.
export const DEMO_USER_EMAIL = "parent@homeschool.local";

export async function getCurrentUser() {
  const user = await db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Demo Parent" },
  });
  return user;
}
