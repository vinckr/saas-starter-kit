import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from 'next';
import type { Role } from '@prisma/client';

import { ory } from '@/lib/ory';
import { getOrCreateLocalUser } from '@/lib/provisionUser';
import { prisma } from '@/lib/prisma';
import { SSO_TENANT_COOKIE, readCookie } from '@/lib/sso';

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    roles: { teamId: string; role: Role }[];
  };
  expires?: string;
};

export const getSession = async (
  req: NextApiRequest | GetServerSidePropsContext['req'],
  _res?: NextApiResponse | GetServerSidePropsContext['res']
): Promise<AppSession | null> => {
  const cookie = req.headers.cookie;

  if (!cookie) {
    return null;
  }

  let session;
  try {
    session = await ory.toSession({ cookie });
  } catch {
    return null;
  }

  if (!session?.active || !session.identity) {
    return null;
  }

  const ssoTenant = readCookie(cookie, SSO_TENANT_COOKIE);
  const user = await getOrCreateLocalUser(session.identity, { ssoTenant });

  const roles = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true, role: true },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      roles,
    },
    expires: session.expires_at ?? undefined,
  };
};
