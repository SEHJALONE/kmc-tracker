import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadScripts } from './gsHarness';
import { emailProblem } from '../utils/emailCheck';

const SOURCE = readFileSync(resolve(__dirname, '../../tools/mail-relay/Code-with-email.gs'), 'utf8');

describe('Request Access email check', () => {
  it('accepts normal addresses', () => {
    for (const ok of ['a.person@example.com', 'x_y@kmc.go.ug', 'Someone@Example.CO.UK ']) expect(emailProblem(ok)).toBeNull();
  });
  it('refuses incomplete or mistyped ones, suggesting the fix', () => {
    expect(emailProblem('jane@gmial.com')).toMatchObject({ suggestion: 'jane@gmail.com' });
    expect(emailProblem('jane@gmail.con').suggestion).toBe('jane@gmail.com');
    for (const bad of ['jane@gmail', 'jane gmail.com', 'jane@', 'jane@@x.com', 'jane@x..com', 'ja ne@x.com', '']) {
      expect(emailProblem(bad)).not.toBeNull();
    }
  });
  it('the server refuses the same addresses and stores nothing', async () => {
    const env = loadScripts([SOURCE]);
    const base = { fullName: 'Test Person', username: 'tperson', department: 'Production', productionLines: [], position: 'Tech', password: 'longenough1' };
    const r = await env.call({ action: 'submitAccessRequest', payload: JSON.stringify({ ...base, email: 'tperson@gmial.com' }) });
    expect(r).toMatchObject({ status: 'error', message: 'bad-email', suggestion: 'tperson@gmail.com' });
    expect((await env.call({ action: 'submitAccessRequest', payload: JSON.stringify({ ...base, email: 'tperson@gmail' }) })).message).toBe('bad-email');
    expect(env.rows('AccessRequests').length).toBeLessThanOrEqual(1);
    expect((await env.call({ action: 'submitAccessRequest', payload: JSON.stringify({ ...base, email: 'tperson@example.com' }) })).status).toBe('ok');
  });
});
