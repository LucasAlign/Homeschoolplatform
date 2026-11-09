import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../lib/db/src/schema/index";
export * from "../../../lib/db/src/schema/index";
export const fixture = new PGlite();
export const db = drizzle(fixture, { schema });
