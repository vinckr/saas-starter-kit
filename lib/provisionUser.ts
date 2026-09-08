import { prisma } from '@/lib/prisma';
import { findOrCreateApp } from '@/lib/svix';
import { slackNotify } from '@/lib/slack';
import { recordMetric } from '@/lib/metrics';
import { slugify } from '@/lib/server-common';
import { maxLengthPolicies } from '@/lib/common';
import { Role, type User } from '@prisma/client';
import { getIdentityTraits, type Identity } from '@/lib/ory';

const normalizeName = (name?: string) =>
  name ? name.substring(0, maxLengthPolicies.name) : name;

const uniqueTeamSlug = async (base: string): Promise<string> => {
  const baseSlug = slugify(base) || 'team';
  let slug = baseSlug;
  let attempt = 0;

  while ((await prisma.team.count({ where: { slug } })) > 0) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  return slug;
};

const createDefaultTeam = async (
  userId: string,
  name: string,
  email: string
) => {
  const teamName = name?.trim() || email.split('@')[0] || 'My Team';
  const slug = await uniqueTeamSlug(teamName);

  const team = await prisma.team.create({ data: { name: teamName, slug } });

  await prisma.teamMember.create({
    data: { teamId: team.id, userId, role: Role.OWNER },
  });

  try {
    await findOrCreateApp(team.name, team.id);
  } catch (error) {
    console.error('Svix findOrCreateApp failed during provisioning:', error);
  }

  return team;
};

const ensureTeamMembership = async (userId: string, teamId: string) => {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return false;

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, role: team.defaultRole },
    update: {},
  });
  return true;
};

export const getOrCreateLocalUser = async (
  identity: Identity,
  opts?: { ssoTenant?: string }
): Promise<User> => {
  const oryId = identity.id;
  const { email, name } = getIdentityTraits(identity);

  const linked = await prisma.user.findUnique({ where: { oryId } });
  if (linked) {
    if (opts?.ssoTenant) await ensureTeamMembership(linked.id, opts.ssoTenant);
    return linked;
  }

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { oryId },
      });
      if (opts?.ssoTenant) {
        await ensureTeamMembership(updated.id, opts.ssoTenant);
      }
      return updated;
    }
  }

  const user = await prisma.user.create({
    data: {
      oryId,
      email,
      name: normalizeName(name) || email,
    },
  });

  if (
    opts?.ssoTenant &&
    (await ensureTeamMembership(user.id, opts.ssoTenant))
  ) {
    recordMetric('user.signup');
    return user;
  }

  const team = await createDefaultTeam(user.id, name || '', email);

  recordMetric('user.signup');
  slackNotify()?.alert({
    text: 'New user signed up',
    fields: {
      Name: user.name,
      Email: user.email,
      Team: team.name,
    },
  });

  return user;
};
