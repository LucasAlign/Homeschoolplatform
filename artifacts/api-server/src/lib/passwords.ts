import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// Versioned parameters; fixed-size salts/hashes and bounded input prevent attacker-selected KDF costs.
const prefix = "scrypt-v1";
let active = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active >= 4)
    throw Object.assign(new Error("Authentication busy"), { status: 429 });
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 },
        (err, key) => (err ? reject(err) : resolve(key)),
      ),
    );
  } finally {
    active--;
  }
}
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const csrfFor = (token: string) => digest("csrf:" + token);
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${prefix}$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, hash?: string) {
  const parts = hash?.split("$");
  const valid =
    parts?.length === 3 &&
    parts[0] === prefix &&
    /^[a-f0-9]{32}$/.test(parts[1]) &&
    /^[a-f0-9]{128}$/.test(parts[2]);
  const actual = await derive(password, valid ? parts[1] : "0".repeat(32));
  return Boolean(
    valid && timingSafeEqual(actual, Buffer.from(parts![2], "hex")),
  );
}
