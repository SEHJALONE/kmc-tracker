import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import HomeScreen from '../components/HomeScreen'

const defaultProps = {
  onSelectTravelCard: vi.fn(),
  onSelectTracker: vi.fn(),
  onLogout: vi.fn(),
  theme: 'dark',
  toggleTheme: vi.fn(),
}

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    render(<HomeScreen {...defaultProps} />)
    expect(document.querySelector('.home-screen')).toBeInTheDocument()
  })

  it('calls onSelectTravelCard when Travel Card button is clicked', () => {
    const onSelectTravelCard = vi.fn()
    render(<HomeScreen {...defaultProps} onSelectTravelCard={onSelectTravelCard} />)
    const btn = screen.getByText(/travel card/i)
    fireEvent.click(btn)
    expect(onSelectTravelCard).toHaveBeenCalledOnce()
  })

  it('calls onSelectTracker when Line Tracker button is clicked', () => {
    const onSelectTracker = vi.fn()
    render(<HomeScreen {...defaultProps} onSelectTracker={onSelectTracker} />)
    const btn = screen.getByText(/line tracker/i)
    fireEvent.click(btn)
    expect(onSelectTracker).toHaveBeenCalledOnce()
  })

  it('calls onLogout when Sign Out is clicked', () => {
    const onLogout = vi.fn()
    render(<HomeScreen {...defaultProps} onLogout={onLogout} />)
    const btn = screen.getByText(/sign out/i)
    fireEvent.click(btn)
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('calls toggleTheme when theme toggle is clicked', () => {
    const toggleTheme = vi.fn()
    render(<HomeScreen {...defaultProps} toggleTheme={toggleTheme} />)
    // In dark mode the button shows "Light" (switch to light)
    const btn = screen.getByText(/light/i)
    fireEvent.click(btn)
    expect(toggleTheme).toHaveBeenCalledOnce()
  })
})
