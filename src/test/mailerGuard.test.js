import { describe, it, expect, vi, beforeEach } from 'vitest';

// The old deployed script files any unknown request with a payload as a Travel
// Card, so nothing with a payload may be sent until a payload-free probe shows
// the deployed script is current.
describe('sendViaAppsScript guard', () => {
  beforeEach(() => { vi.resetModules(); });

  it('sends nothing with a payload to the old script', async () => {
    const fetch = vi.fn(async () => ({ json: async () => ({ status: 'error', message: '"undefined" is not valid JSON' }) }));
    vi.stubGlobal('fetch', fetch);
    const { sendViaAppsScript, OUTDATED_SCRIPT } = await import('../data/mailer');
    await expect(sendViaAppsScript('notifyCardSubmitted', { vin: 'X' })).rejects.toThrow(OUTDATED_SCRIPT);
    await expect(sendViaAppsScript('sendReportEmail', { to: 'a@b.co' })).rejects.toThrow(OUTDATED_SCRIPT);
    expect(fetch).toHaveBeenCalledTimes(1);                       // the probe only, asked once
    expect(String(fetch.mock.calls[0][1].body)).not.toContain('payload');
  });

  it('sends once the script answers the probe like the current one', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ status: 'error', message: 'unauthorized' }) })
      .mockResolvedValueOnce({ json: async () => ({ status: 'ok', approvers: 1 }) });
    vi.stubGlobal('fetch', fetch);
    const { sendViaAppsScript } = await import('../data/mailer');
    expect(await sendViaAppsScript('notifyCardSubmitted', { vin: 'X' })).toMatchObject({ approvers: 1 });
    expect(String(fetch.mock.calls[1][1].body)).toContain('payload');
  });
});
