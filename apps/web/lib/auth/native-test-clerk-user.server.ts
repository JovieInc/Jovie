import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function getExistingUserId(
  clerk: ClerkClient,
  userId: string
): Promise<string | null> {
  try {
    const user = await clerk.users.getUser(userId);
    return user.id.trim() || null;
  } catch {
    return null;
  }
}

async function getUserIdByEmail(
  clerk: ClerkClient,
  email: string
): Promise<string | null> {
  try {
    const users = await clerk.users.getUserList({
      emailAddress: [email],
    });
    return users.data[0]?.id?.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveConfiguredNativeTestClerkUserId(): Promise<
  string | null
> {
  const explicitUserId = readTrimmedEnv('JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID');
  const e2eEmail = readTrimmedEnv('E2E_CLERK_USER_USERNAME');
  const e2eUserId = readTrimmedEnv('E2E_CLERK_USER_ID');
  if (!explicitUserId && !e2eEmail && !e2eUserId) {
    return null;
  }

  const clerk = await clerkClient();

  if (explicitUserId) {
    return getExistingUserId(clerk, explicitUserId);
  }

  if (e2eEmail) {
    const emailUserId = await getUserIdByEmail(clerk, e2eEmail);
    if (emailUserId) {
      return emailUserId;
    }
  }

  if (e2eUserId) {
    return getExistingUserId(clerk, e2eUserId);
  }

  return null;
}
