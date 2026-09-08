import { Role } from '@prisma/client';
import type { Identity } from '@ory/client-fetch';

const findOrCreateApp = jest.fn();
const recordMetric = jest.fn();
const slackAlert = jest.fn();

jest.mock('lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    team: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    teamMember: { create: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock('lib/svix', () => ({
  findOrCreateApp: (...a: unknown[]) => findOrCreateApp(...a),
}));
jest.mock('lib/metrics', () => ({
  recordMetric: (...a: unknown[]) => recordMetric(...a),
}));
jest.mock('lib/slack', () => ({ slackNotify: () => ({ alert: slackAlert }) }));

import { prisma } from 'lib/prisma';
import { getOrCreateLocalUser } from 'lib/provisionUser';

// Typed handle to the mocked prisma client.
const db = prisma as unknown as {
  user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  team: { count: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
  teamMember: { create: jest.Mock; upsert: jest.Mock };
};

const identity = (id: string, traits: object): Identity =>
  ({ id, traits }) as Identity;

beforeEach(() => {
  jest.clearAllMocks();
  db.team.count.mockResolvedValue(0);
});

describe('Lib - getOrCreateLocalUser', () => {
  it('returns the existing user when already linked by oryId', async () => {
    const existing = { id: 'local-1', oryId: 'ory-1', email: 'a@b.com' };
    db.user.findUnique.mockResolvedValueOnce(existing);

    const result = await getOrCreateLocalUser(
      identity('ory-1', { email: 'a@b.com' })
    );

    expect(result).toBe(existing);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.team.create).not.toHaveBeenCalled();
  });

  it('adds an SSO user to the requested existing team', async () => {
    const existing = { id: 'local-1', oryId: 'ory-1', email: 'a@b.com' };
    db.user.findUnique.mockResolvedValueOnce(existing);
    db.team.findUnique.mockResolvedValueOnce({
      id: 'team-1',
      defaultRole: Role.MEMBER,
    });

    await getOrCreateLocalUser(identity('ory-1', { email: 'a@b.com' }), {
      ssoTenant: 'team-1',
    });

    expect(db.teamMember.upsert).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team-1', userId: 'local-1' } },
      create: { teamId: 'team-1', userId: 'local-1', role: Role.MEMBER },
      update: {},
    });
  });

  it('links an existing user matched by email and does not create a team', async () => {
    db.user.findUnique
      .mockResolvedValueOnce(null) // by oryId
      .mockResolvedValueOnce({ id: 'local-2', email: 'c@d.com' }); // by email
    db.user.update.mockResolvedValueOnce({ id: 'local-2', oryId: 'ory-2' });

    const result = await getOrCreateLocalUser(
      identity('ory-2', { email: 'c@d.com' })
    );

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'local-2' },
      data: { oryId: 'ory-2' },
    });
    expect(db.team.create).not.toHaveBeenCalled();
    expect(result.oryId).toBe('ory-2');
  });

  it('creates a new user + default OWNER team on first login', async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.user.create.mockResolvedValueOnce({
      id: 'local-3',
      email: 'new@corp.com',
      name: 'New User',
    });
    db.team.create.mockResolvedValueOnce({ id: 'team-3', name: 'New User' });

    await getOrCreateLocalUser(
      identity('ory-3', { email: 'new@corp.com', name: 'New User' })
    );

    expect(db.user.create).toHaveBeenCalledWith({
      data: { oryId: 'ory-3', email: 'new@corp.com', name: 'New User' },
    });
    expect(db.teamMember.create).toHaveBeenCalledWith({
      data: { teamId: 'team-3', userId: 'local-3', role: Role.OWNER },
    });
    expect(findOrCreateApp).toHaveBeenCalledWith('New User', 'team-3');
    expect(recordMetric).toHaveBeenCalledWith('user.signup');
    expect(slackAlert).toHaveBeenCalled();
  });

  it('truncates an imported display name to the application limit', async () => {
    const name = 'x'.repeat(100);
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.user.create.mockResolvedValueOnce({
      id: 'local-5',
      email: 'long@corp.com',
      name: name.slice(0, 104),
    });
    db.team.create.mockResolvedValueOnce({ id: 'team-5', name });

    await getOrCreateLocalUser(
      identity('ory-5', { email: 'long@corp.com', name })
    );

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        oryId: 'ory-5',
        email: 'long@corp.com',
        name: name.slice(0, 104),
      },
    });
  });

  it('does not fail provisioning when the Svix webhook app call throws', async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.user.create.mockResolvedValueOnce({
      id: 'local-4',
      email: 'x@corp.com',
      name: 'X',
    });
    db.team.create.mockResolvedValueOnce({ id: 'team-4', name: 'X' });
    findOrCreateApp.mockRejectedValueOnce(new Error('svix 401'));

    await expect(
      getOrCreateLocalUser(
        identity('ory-4', { email: 'x@corp.com', name: 'X' })
      )
    ).resolves.toMatchObject({ id: 'local-4' });
  });
});
