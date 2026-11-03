import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TravelCard from '../components/TravelCard'
import { PPE_ITEMS, prefillPpe, encodePpe, parsePpe } from '../utils/ppe'

describe('ppe utils', () => {
  it('prefills every standard item with the crew size, keeping extras', () => {
    const p = prefillPpe(3, { 'Welding mask': '1' })
    for (const item of PPE_ITEMS) expect(p[item]).toBe('3')
    expect(p['Welding mask']).toBe('1')
  })

  it('round-trips through the hse_resources column, dropping zero rows', () => {
    const raw = encodePpe({ 'Safety helmet': '4', 'Safety gloves': '0', 'Ear protection': '' })
    expect(raw).toBe('{"Safety helmet":4}')
    expect(parsePpe(raw)).toEqual({ items: { 'Safety helmet': 4 }, total: 4, legacy: false })
  })

  it('reads the bare count older cards stored', () => {
    expect(parsePpe('2')).toEqual({ items: {}, total: 2, legacy: true })
    expect(parsePpe('')).toEqual({ items: {}, total: 0, legacy: false })
  })
})

describe('TravelCard PPE and clock times', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kmc_station_ops_B01-01', JSON.stringify(['Ann', 'Ben']))
    localStorage.setItem('kmc_sel_B01-01', JSON.stringify(['Ann', 'Ben']))
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
  })

  const station = 'B01-01: Rectangular Tubes & Steel Plate Storage'

  it('prefills PPE from the crew and lets the operator change it', async () => {
    render(<TravelCard prefillModel="12m EVS" prefillVin="VIN1" lockedStation="B01-01" />)
    const helmet = await screen.findByText('Safety helmet')
    const input = () => helmet.parentElement.querySelector('input')
    await waitFor(() => expect(input().value).toBe('2'))
    fireEvent.change(input(), { target: { value: '5' } })
    expect(input().value).toBe('5')
    expect(screen.queryByText(/Prefilled with one per staff member/)).toBeNull()
  })

  it('shows editable clock-in and clock-out on a legacy card for a plain user', async () => {
    const editSubmission = {
      recordId: 'R1', busModel: '12m EVS', project: 'P', vin: 'VIN1', line: 'MACHINE',
      station, stationCode: 'B01-01', operators: ['Ann'],
      hseResources: '{"Safety boots":1}', clockIn: '2026-11-03T08:00', clockOut: '2026-11-03T12:00:00.000Z',
    }
    render(<TravelCard role="user" editSubmission={editSubmission} />)
    const boots = await screen.findByText('Safety boots')
    expect(boots.parentElement.querySelector('input').value).toBe('1')
    fireEvent.click(screen.getByText(/Continue to activities/))
    expect(screen.getByText('Clock in time')).toBeInTheDocument()
    expect(screen.getByText('Clock out time')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue(/2026-11-03T/).length).toBe(2)
  })
})
