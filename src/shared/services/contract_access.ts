import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { user } from '@/config/db/schema';
import { db } from '@/core/db';
import { getUuid } from '@/shared/lib/hash';
import { getUserInfo } from '@/shared/models/user';

const ANONYMOUS_CONTRACT_USER_ID = 'system-anonymous-contract-owner';
const ANONYMOUS_CONTRACT_USER_EMAIL =
  'system-anonymous-contract-owner@local.invalid';
const ANONYMOUS_CONTRACT_USER_NAME = 'Anonymous Contract Workspace';

export const CONTRACT_SESSION_COOKIE_NAME = 'contract_session';

export type ContractAccessContext = {
  user: Awaited<ReturnType<typeof getUserInfo>> | null;
  ownerUserId: string;
  sessionToken: string;
  isAnonymous: boolean;
};

export async function getContractAccessContext({
  createAnonymousSession = false,
}: {
  createAnonymousSession?: boolean;
} = {}): Promise<ContractAccessContext> {
  const user = await getUserInfo();
  if (user) {
    return {
      user,
      ownerUserId: user.id,
      sessionToken: '',
      isAnonymous: false,
    };
  }

  const cookieStore = await cookies();
  let sessionToken = String(
    cookieStore.get(CONTRACT_SESSION_COOKIE_NAME)?.value || ''
  ).trim();

  if (!sessionToken && createAnonymousSession) {
    sessionToken = getUuid();
    cookieStore.set(CONTRACT_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  const anonymousOwner = await ensureAnonymousContractOwner();
  return {
    user: null,
    ownerUserId: anonymousOwner.id,
    sessionToken,
    isAnonymous: true,
  };
}

export function withContractAccessMetadata(
  raw: string | null | undefined,
  patch: Record<string, any>
) {
  const base = safeParseJsonObject(raw);
  return JSON.stringify({
    ...base,
    contractAccess: {
      ...(base.contractAccess || {}),
      ...patch,
    },
  });
}

export function getDocumentSessionToken(raw: string | null | undefined) {
  const metadata = safeParseJsonObject(raw);
  return String(metadata?.contractAccess?.sessionToken || '').trim();
}

export function canAccessDocument(
  document: { userId: string; metadata?: string | null } | null | undefined,
  access: Pick<ContractAccessContext, 'ownerUserId' | 'sessionToken' | 'user'>
) {
  if (!document) return false;
  const documentSessionToken = getDocumentSessionToken(document.metadata);
  if (document.userId === access.ownerUserId) {
    if (!documentSessionToken) {
      return true;
    }
    return !!access.sessionToken && access.sessionToken === documentSessionToken;
  }

  if (access.user && documentSessionToken) {
    return !!access.sessionToken && access.sessionToken === documentSessionToken;
  }

  if (!documentSessionToken && document.userId === access.ownerUserId) {
    return true;
  }
  return false;
}

export function safeParseJsonObject(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
  } catch (_) {
    // ignore invalid metadata and fall back to empty object
  }
  return {};
}

async function ensureAnonymousContractOwner() {
  const [existing] = await db()
    .select()
    .from(user)
    .where(eq(user.id, ANONYMOUS_CONTRACT_USER_ID))
    .limit(1);
  if (existing) {
    return existing;
  }

  try {
    const [created] = await db()
      .insert(user)
      .values({
        id: ANONYMOUS_CONTRACT_USER_ID,
        name: ANONYMOUS_CONTRACT_USER_NAME,
        email: ANONYMOUS_CONTRACT_USER_EMAIL,
        emailVerified: true,
        locale: 'en',
        utmSource: 'system',
        ip: '',
      })
      .returning();

    if (created) {
      return created;
    }
  } catch (_) {
    // Another request may have created the internal owner concurrently.
  }

  const [retry] = await db()
    .select()
    .from(user)
    .where(eq(user.id, ANONYMOUS_CONTRACT_USER_ID))
    .limit(1);
  if (!retry) {
    throw new Error('failed to ensure anonymous contract owner');
  }

  return retry;
}
