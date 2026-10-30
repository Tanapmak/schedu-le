import { describe, expect, it } from 'vitest';
import { authConfig } from '../src/auth.js';

describe('authConfig', () => {
  it('uses dev sign-in outside production', () => {
    expect(authConfig({})).toEqual({ mode: 'dev' });
  });

  it('requires IAP in production and refuses to start without its audience', () => {
    expect(() => authConfig({ NODE_ENV: 'production' })).toThrow(/IAP_AUDIENCE/);
    expect(authConfig({ NODE_ENV: 'production', IAP_AUDIENCE: '/projects/1/locations/x/services/y' })).toEqual({
      mode: 'iap',
      audience: '/projects/1/locations/x/services/y',
    });
  });

  it('rejects an unknown mode', () => {
    expect(() => authConfig({ AUTH_MODE: 'open' })).toThrow(/iap or dev/);
  });
});
