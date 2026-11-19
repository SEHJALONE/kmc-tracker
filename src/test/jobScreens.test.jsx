import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { makeItem, partLabel } from '../data/jobOrders';

// The job tracker and the waste lines render from job data alone.
const items = [
  makeItem({ id: 'a', balloon: '1', name: 'Column', qty: 2, spec: '□40x40x3.0', length: '34', material: 'Hollow section' }),
  makeItem({ id: 'b', balloon: '2', name: 'Plate', qty: 1, spec: 'Sheet 2mm', material: 'Sheet' }),
];
const job = { id: 'JO-1', project: 'P', busModel: '10.5m EVS', vins: ['V1'], status: 'open', createdAt: '2026-11-02T08:00:00.000Z', items };
const run = { id: 'r1', jobOrderId: 'JO-1', status: 'open', stationCode: 'B01-02', ownerName: 'Op One', startedAt: new Date().toISOString(),
  activities: [{ name: partLabel(items[0]), doneAt: '2026-11-03T07:00:00.000Z' }, { name: partLabel(items[1]), doneAt: '' }] };

vi.mock('../hooks/useJobData', () => ({
  useJobData: () => ({ jobOrders: [job], runs: [run], loading: false, refresh: () => {} }),
  JOB_ERRORS: {},
}));

describe('job screens', () => {
  it('the tracker shows the job being machined, who runs it and how far it is', async () => {
    const { default: JobTracker } = await import('../components/jobs/JobTracker');
    render(<JobTracker catalog={{}} jobData={{ jobOrders: [job], runs: [run], loading: false, refresh: () => {} }} />);
    expect(screen.getByText('JO-1')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 parts cut')).toBeInTheDocument();
    expect(screen.getByText(/Op One · running/)).toBeInTheDocument();
  });

  it('waste lines preset mm for sections and kg for sheets, and save a typed custom unit', async () => {
    const { default: JobWaste } = await import('../components/jobs/JobWaste');
    const onSave = vi.fn();
    render(<JobWaste task={{ ...run, waste: [] }} onSave={onSave} />);
    const units = screen.getAllByLabelText('Unit');
    expect(units.map(u => u.value)).toEqual(['mm', 'kg']);
    fireEvent.change(screen.getByLabelText('Waste for □40x40x3.0'), { target: { value: '250' } });
    fireEvent.blur(screen.getByLabelText('Waste for □40x40x3.0'));
    expect(onSave).toHaveBeenLastCalledWith([{ spec: '□40x40x3.0', material: 'Hollow section', amount: 250, unit: 'mm' }, { spec: 'Sheet 2mm', material: 'Sheet', amount: '', unit: 'kg' }]);
    fireEvent.change(units[1], { target: { value: '__custom' } });
    const custom = screen.getByLabelText('Custom unit');
    fireEvent.change(custom, { target: { value: 'sheets' } });
    fireEvent.blur(custom);
    expect(onSave.mock.lastCall[0][1]).toMatchObject({ spec: 'Sheet 2mm', unit: 'sheets' });
  });
});
