import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Login from '../components/Login'
import { getSession, clearSession } from '../data/session'

const defaultProps = {
  onLogin: vi.fn(),
  theme: 'dark',
  toggleTheme: vi.fn(),
}

// A token shaped like the server's: base64url(JSON{u,r,e}) + "." + signature.
const makeToken = (over = {}) => {
  const p = { u: 'kmc', r: 'user', e: Date.now() + 3600_000, ...over }
  return btoa(JSON.stringify(p)).replace(/\+/g, '-').replace(/\//g, '_') + '.sig'
}

// Stand-in for the Apps Script `login` action. Only these accounts exist.
const ACCOUNTS = {
  'kmc:pass-1':  { username: 'kmc',  role: 'user' },
  'boss:pass-2': { username: 'boss', role: 'useradmin', domain: 'Quality', landing: 'scoreboard' },
}
function stubServer(handler) {
  const fetchMock = vi.fn(async (_url, opts) => {
    const p = Object.fromEntries(opts.body.entries())
    return { json: async () => handler(p) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const serverLogin = (p) => {
  const user = ACCOUNTS[`${p.username}:${p.password}`]
  return user
    ? { status: 'ok', user, session: makeToken({ u: user.username, r: user.role }) }
    : { status: 'error', message: 'invalid-credentials' }
}

const fill = (u, p) => {
  fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: u } })
  fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: p } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('Login', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); stubServer(serverLogin) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders username and password fields', () => {
    render(<Login {...defaultProps} />)
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
  })

  it('has a guidelines button that offers the user guide PDF', () => {
    render(<Login {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /guidelines and user guide/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/download user guide/i).closest('a')).toHaveAttribute('href', '/docs/KMC-Production-Tracker-User-Guide.pdf')
  })

  it('shows error when submitting empty fields', () => {
    render(<Login {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/please enter your username and password/i)).toBeInTheDocument()
  })

  it('has no built-in accounts: the old published passwords are rejected', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fill('systemadmin', 'admin1234!')
    await waitFor(() => expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument())
    expect(onLogin).not.toHaveBeenCalled()
    expect(getSession()).toBeNull()
  })

  it('checks credentials with the server, never in the browser', async () => {
    const fetchMock = stubServer(serverLogin)
    render(<Login {...defaultProps} />)
    fill('Kmc', 'pass-1')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const sent = Object.fromEntries(fetchMock.mock.calls[0][1].body.entries())
    expect(sent).toMatchObject({ action: 'login', username: 'kmc', password: 'pass-1' })
  })

  it('signs in with the role, domain and landing the server returns, and keeps the session', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fill('boss', 'pass-2')
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('useradmin', 'Quality', 'scoreboard'))
    expect(getSession()).toBeTruthy()
    expect(sessionStorage.getItem('kmc_session')).toBeTruthy()   // not remembered → tab-only
    expect(localStorage.getItem('kmc_session')).toBeNull()
  })

  it('"keep me signed in" stores the session durably', async () => {
    render(<Login {...defaultProps} />)
    fireEvent.click(screen.getByLabelText(/keep me signed in/i))
    fill('kmc', 'pass-1')
    await waitFor(() => expect(localStorage.getItem('kmc_auth')).toBe('true'))
    expect(localStorage.getItem('kmc_session')).toBeTruthy()
  })

  it('shows a lockout message after too many attempts', async () => {
    stubServer(() => ({ status: 'error', message: 'too-many-attempts' }))
    render(<Login {...defaultProps} />)
    fill('kmc', 'x')
    await waitFor(() => expect(screen.getByText(/too many wrong attempts/i)).toBeInTheDocument())
  })

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<Login {...defaultProps} />)
    fill('kmc', 'pass-1')
    await waitFor(() => expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument())
  })
})

describe('session', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
  it('ignores and clears an expired session', () => {
    localStorage.setItem('kmc_session', makeToken({ e: Date.now() - 1000 }))
    expect(getSession()).toBeNull()
    expect(localStorage.getItem('kmc_session')).toBeNull()
  })
  it('clearSession removes both stores', () => {
    localStorage.setItem('kmc_session', makeToken()); sessionStorage.setItem('kmc_session', makeToken())
    clearSession()
    expect(getSession()).toBeNull()
  })
  it('rejects garbage', () => {
    localStorage.setItem('kmc_session', 'not-a-token')
    expect(getSession()).toBeNull()
  })
})
