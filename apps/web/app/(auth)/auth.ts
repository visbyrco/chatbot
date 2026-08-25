import crypto from "node:crypto";
import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  isClerkConfiguredNow,
  isDemoModeNow,
  isTestEnvironmentNow,
  usesMockAuthNow,
} from "@/lib/constants";
import {
  createUserFromClerk,
  getOrCreateUserByEmail,
  getUserByClerkId,
} from "@/lib/db/queries";

const emailSchema = z.string().email();

// In-memory limiter for test-user creation — bounded to avoid DoS via email rotation.
// Uses globalThis to survive HMR in dev.
const TEST_USER_RATE_WINDOW_MS = 60_000;
const TEST_USER_RATE_LIMIT = 30;
const MAX_TEST_USER_KEYS = 5000;
type RateEntry = { count: number; resetAt: number };
const testUserHits: Map<string, RateEntry> =
  (globalThis as unknown as { __testUserHits?: Map<string, RateEntry> })
    .__testUserHits ?? new Map<string, RateEntry>();
(
  globalThis as unknown as { __testUserHits?: Map<string, RateEntry> }
).__testUserHits = testUserHits;

function pruneTestUserHits(): void {
  const now = Date.now();
  for (const [k, v] of testUserHits) {
    if (v.resetAt <= now) {
      testUserHits.delete(k);
    }
  }
  if (testUserHits.size > MAX_TEST_USER_KEYS) {
    // evict oldest entries
    const toDelete = testUserHits.size - MAX_TEST_USER_KEYS;
    let deleted = 0;
    for (const k of testUserHits.keys()) {
      if (deleted >= toDelete) {
        break;
      }
      testUserHits.delete(k);
      deleted += 1;
    }
  }
}

function checkTestUserRateLimit(key: string): boolean {
  pruneTestUserHits();
  const now = Date.now();
  const entry = testUserHits.get(key);
  if (!entry || entry.resetAt <= now) {
    testUserHits.set(key, {
      count: 1,
      resetAt: now + TEST_USER_RATE_WINDOW_MS,
    });
    return true;
  }
  if (entry.count >= TEST_USER_RATE_LIMIT) {
    return false;
  }
  entry.count += 1;
  return true;
}

function verifySignedTestUserCookie(raw: string): string | null {
  // Strict: require email|hmac, exactly one pipe. Plain email only when
  // ALLOW_PLAIN_TEST_COOKIE=1 in non-production for local dev, or when
  // ENCRYPTION_KEY is unset (test without key).
  if (
    process.env["ALLOW_PLAIN_TEST_COOKIE"] === "1" &&
    process.env["NODE_ENV"] !== "production"
  ) {
    const plain = emailSchema.safeParse(raw);
    if (plain.success) {
      return plain.data;
    }
  }
  const secret = process.env["ENCRYPTION_KEY"];
  if (!secret) {
    // No key configured (e.g. CI without .env) — accept plain for test env.
    if (isTestEnvironmentNow()) {
      const plain = emailSchema.safeParse(raw);
      if (plain.success) {
        return plain.data;
      }
    }
    return null;
  }
  const parts = raw.split("|");
  if (parts.length !== 2) {
    return null;
  }
  const [email, sig] = parts;
  if (!email || !sig) {
    return null;
  }
  const emailValid = emailSchema.safeParse(email);
  if (!emailValid.success) {
    return null;
  }
  // sig must be hex 64 chars (sha256)
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(email, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  return email;
}

export function signTestUserCookie(email: string): string {
  const secret = process.env["ENCRYPTION_KEY"];
  if (!secret) {
    return email;
  }
  const sig = crypto
    .createHmac("sha256", secret)
    .update(email, "utf8")
    .digest("hex");
  return `${email}|${sig}`;
}

export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  name: string | null;
};

export type Session = {
  user: User;
};

export async function auth(): Promise<Session | null> {
  if (usesMockAuthNow()) {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get("test-user")?.value;

    let email: string | undefined;
    if (rawCookie !== undefined) {
      const verified = verifySignedTestUserCookie(rawCookie);
      if (!verified) {
        return null;
      }
      email = verified;
      if (
        !isTestEnvironmentNow() &&
        !checkTestUserRateLimit(`test-user:${email}`)
      ) {
        return null;
      }
    } else if (
      isDemoModeNow() ||
      !isClerkConfiguredNow() ||
      !process.env["POSTGRES_URL"] ||
      process.env["VERCEL_ENV"] === "preview"
    ) {
      // Per-session demo user is minted in middleware (see middleware.ts).
      // Middleware uses plain demo-.*@demo.local for Edge compatibility;
      // accept both signed and plain demo pattern when isDemoMode. In
      // Vercel preview without DB we also mint demo-session so preview stays
      // usable without Clerk sign-in.
      const demoCookie = cookieStore.get("demo-session")?.value;
      if (!demoCookie) {
        return null;
      }
      let v = verifySignedTestUserCookie(demoCookie);
      if (!v) {
        const plain = emailSchema.safeParse(demoCookie);
        if (plain.success && /^demo-.*@demo\.local$/.test(plain.data)) {
          v = plain.data;
        }
      }
      if (!v) {
        return null;
      }
      email = v;
      if (!isTestEnvironmentNow() && !checkTestUserRateLimit(`demo:${email}`)) {
        return null;
      }
    }

    if (!email) {
      return null;
    }

    const dbUser = await getOrCreateUserByEmail(email);
    return { user: dbUser };
  }

  const { userId } = await clerkAuth();
  if (!userId) {
    return null;
  }

  let dbUser = await getUserByClerkId(userId);
  if (!dbUser) {
    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId
    )?.emailAddress;
    const email = primaryEmail ?? clerkUser?.emailAddresses[0]?.emailAddress;

    if (!email || !emailSchema.safeParse(email).success) {
      return null;
    }

    dbUser = await createUserFromClerk({
      clerkId: userId,
      email,
      emailVerified: clerkUser?.emailAddresses.some(
        (address) => address.verification?.status === "verified"
      ),
      image: clerkUser?.imageUrl ?? null,
      name: clerkUser?.fullName ?? null,
    });
  }

  return { user: dbUser };
}
