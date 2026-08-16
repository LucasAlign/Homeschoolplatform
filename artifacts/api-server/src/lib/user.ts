import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEMO_USER_ID = "demo-parent";
export const DEMO_USER_EMAIL = "parent@homeschool.local";

export async function ensureDemoUser() {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, DEMO_USER_ID));

  if (!existing) {
    await db.insert(usersTable).values({
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: "Demo Parent",
    });
  }
}
