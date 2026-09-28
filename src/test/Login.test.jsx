import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Login from '../components/Login'

const defaultProps = {
  onLogin: vi.fn(),
  theme: 'dark',
  toggleTheme: vi.fn(),
}

describe('Login', () => {
  // Accounts that aren't built in are checked against the Apps Script; stub it
  // so the suite never hits the network and "unknown user" is deterministic.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ status: 'error', message: 'invalid-credentials' }) })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('has a guidelines button that offers the user guide PDF', () => {
    render(<Login {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /guidelines and user guide/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/download user guide/i).closest('a')).toHaveAttribute('href', '/docs/KMC-Production-Tracker-User-Guide.pdf')
  })
  it('renders username and password fields', () => {
    render(<Login {...defaultProps} />)
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
  })

  it('shows error when submitting empty fields', () => {
    render(<Login {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/please enter your username and password/i)).toBeInTheDocument()
  })

  it('shows error for wrong credentials', async () => {
    render(<Login {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'wronguser' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument(),
      { timeout: 2000 }
    )
  })

  it('calls onLogin with "user" role for valid user credentials', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'kmc' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'kmc1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('user', null, null), { timeout: 2000 })
  })

  it('calls onLogin with "useradmin" role for valid useradmin credentials', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'kmcadmin' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'KMC1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('useradmin', null, null), { timeout: 2000 })
  })

  it('calls onLogin with "systemadmin" role for valid systemadmin credentials', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'systemadmin' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'admin1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('systemadmin', null, null), { timeout: 2000 })
  })

  it('login is case-insensitive for username', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'KMC' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'kmc1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('user', null, null), { timeout: 2000 })
  })
})
