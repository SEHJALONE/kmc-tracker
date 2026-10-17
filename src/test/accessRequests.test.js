import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { submitAccessRequest, describeRequestError, useAccessRequests } from '../hooks/useAccessRequests.js';

// The server's real answer is what the screens must show: no more "submitted"
// for a request that was never stored, and no more empty lists that hide a
// refusal.

const reply = body => new Response(JSON.stringify(body), { status: 200 });
const actionOf = init => new URLSearchParams(init.body).get('action');

let calls;
function stubServer(handler) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push({ action: actionOf(init), init });
    return handler(actionOf(init), init);
  }));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('submitAccessRequest', () => {
  it('counts a request as sent only when the server stored it', async () => {
    stubServer(() => reply({ status: 'ok', id: 'abc' }));
    expect(await submitAccessRequest({ username: 'a' })).toEqual({ ok: true, id: 'abc' });
  });

  it('reads the reply: it does not post with no-cors', async () => {
    stubServer(() => reply({ status: 'ok', id: 'abc' }));
    await submitAccessRequest({ username: 'a' });
    expect(calls[0].init.mode).toBeUndefined();
  });

  it('turns the server\'s reasons into words', async () => {
    stubServer(() => reply({ status: 'error', message: 'username-taken' }));
    const r = await submitAccessRequest({ username: 'a' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already in use/);

    stubServer(() => reply({ status: 'error', message: 'request-already-pending' }));
    expect((await submitAccessRequest({})).error).toMatch(/already waiting/);
  });

  it('does not report success when the server cannot be reached or answers nonsense', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const down = await submitAccessRequest({});
    expect(down).toMatchObject({ ok: false, code: 'network' });
    expect(down.error).toMatch(/connection/);

    stubServer(() => new Response('<html>Error</html>', { status: 200 }));
    expect((await submitAccessRequest({})).ok).toBe(false);
  });
});

describe('describeRequestError', () => {
  it('explains an unauthorized answer as a sign-in or server-version problem', () => {
    expect(describeRequestError('unauthorized')).toMatch(/Sign out and sign in again/);
    expect(describeRequestError('unauthorized')).toMatch(/out of date/);
  });
});

describe('useAccessRequests', () => {
  const pending = [{ id: '1', username: 'amina', status: 'pending', fullName: 'Amina' }];

  it('shows the list and no error when the server accepts the admin', async () => {
    stubServer(action => (action === 'listAccessRequests' ? reply({ status: 'ok', requests: pending }) : reply({ status: 'ok' })));
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requests).toEqual(pending);
    expect(result.current.loadError).toBeNull();
  });

  it('says so, and keeps the saved copy, when the server refuses the list', async () => {
    localStorage.setItem('kmc_access_requests_cache', JSON.stringify(pending));
    stubServer(() => reply({ status: 'error', message: 'unauthorized' }));
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toMatchObject({ code: 'unauthorized' });
    expect(result.current.loadError.message).toMatch(/sign in again/i);
    expect(result.current.requests).toEqual(pending);       // the saved copy, flagged by loadError
  });

  it('puts a row back, and reports the failure, when a decision is refused', async () => {
    stubServer(action => {
      if (action === 'listAccessRequests') return reply({ status: 'ok', requests: pending });
      return reply({ status: 'error', message: 'unauthorized' });
    });
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.requests).toEqual(pending));

    let out;
    await act(async () => { out = await result.current.updateRequest({ id: '1', status: 'denied' }); });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/sign in again/i);
    await waitFor(() => expect(result.current.requests[0].status).toBe('pending'));   // reloaded from the server
    expect(calls.filter(c => c.action === 'listAccessRequests').length).toBeGreaterThanOrEqual(2);
  });

  it('reports a refused removal too', async () => {
    stubServer(action => (action === 'listAccessRequests' ? reply({ status: 'ok', requests: pending }) : reply({ status: 'error', message: 'unauthorized' })));
    const { result } = renderHook(() => useAccessRequests());
    await waitFor(() => expect(result.current.requests).toEqual(pending));
    let out;
    await act(async () => { out = await result.current.deleteRequest('1'); });
    expect(out.ok).toBe(false);
  });
});
