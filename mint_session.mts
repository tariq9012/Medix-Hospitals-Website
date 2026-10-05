import "dotenv/config";
import { randomBytes, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { authSessions, users } from "./src/db/schema";
function generateSecureToken(): string { return randomBytes(32).toString("base64url"); }
function hashToken(rawToken: string): string { return createHmac("sha256", process.env.SESSION_SECRET!).update(rawToken).digest("hex"); }
async function mint(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const token = generateSecureToken();
  await db.insert(authSessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now()+3600*1000) });
  return token;
}
const t = await mint("dr.ahmed.raza@medix.example");
console.log(t);
process.exit(0);
