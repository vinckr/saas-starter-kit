// Avoid loading the real @boxyhq/saml-jackson (embedded Polis) in unit tests.
jest.mock('lib/jackson', () => ({ __esModule: true, default: jest.fn() }));

import { injectTenant } from 'pages/api/oauth/authorize';

describe('SSO authorize - injectTenant', () => {
  const base = {
    response_type: 'code',
    client_id: 'dummy',
    redirect_uri:
      'http://localhost:4433/self-service/methods/oidc/callback/sso',
    state: 'abc',
    scope: 'openid email profile',
    nonce: 'n-123',
  };

  it('rewrites client_id to the Polis tenant/product form when a tenant is present', () => {
    const out = injectTenant(base, 'team-42', 'boxyhq');
    expect(out.client_id).toBe('tenant=team-42&product=boxyhq');
  });

  it('preserves all other Kratos-supplied params (redirect_uri, state, scope, nonce)', () => {
    const out = injectTenant(base, 'team-42', 'boxyhq');
    expect(out.redirect_uri).toBe(base.redirect_uri);
    expect(out.state).toBe(base.state);
    expect(out.scope).toBe(base.scope);
    expect(out.nonce).toBe(base.nonce);
    expect(out.response_type).toBe('code');
  });

  it('passes params through untouched when no tenant cookie is present', () => {
    const out = injectTenant(base, undefined, 'boxyhq');
    expect(out).toEqual(base);
    expect(out.client_id).toBe('dummy');
  });
});
