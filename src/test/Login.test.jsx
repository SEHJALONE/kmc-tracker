import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Login from '../components/Login'

const defaultProps = {
  onLogin: vi.fn(),
  theme: 'dark',
  toggleTheme: vi.fn(),
}

describe('Login', () => {
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
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('user'), { timeout: 2000 })
  })

  it('calls onLogin with "useradmin" role for valid useradmin credentials', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'kmcadmin' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'KMC1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('useradmin'), { timeout: 2000 })
  })

  it('calls onLogin with "systemadmin" role for valid systemadmin credentials', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'systemadmin' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'admin1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('systemadmin'), { timeout: 2000 })
  })

  it('login is case-insensitive for username', async () => {
    const onLogin = vi.fn()
    render(<Login {...defaultProps} onLogin={onLogin} />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'KMC' } })
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'kmc1234!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('user'), { timeout: 2000 })
  })
})
