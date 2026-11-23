import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { otherLineChoices, linesToShow, mayWorkOtherLines } from '../data/jobOrders';

// A general user works on their own line by default and may pick another.
const job = (id, line, title) => ({ id, kind: 'other', projectId: 'PRJ-1', project: 'Tank', line, title, status: 'open', items: [], activities: [{ id: 'a', name: 'Step' }], vins: [], comments: [], createdAt: '2026-11-20T08:00:00Z', createdByName: 'Sup' });
const data = {
  jobOrders: [job('OP-1', 'Machine Shop', 'Plates'), job('OP-2', 'Paint Shop', 'Paint it'), job('OP-3', 'Parts Making', 'Weld it')],
  runs: [], scope: ['Paint Shop'], manageLines: [], loaded: true, loading: false, refresh: () => {},
};
vi.mock('../hooks/useJobData', () => ({ useJobData: () => data, JOB_ERRORS: {} }));

describe('working on another line', () => {
  it('offers the lines that are not their own, and shows that line alone when picked', () => {
    expect(otherLineChoices(['Paint Shop'])).toEqual(['Machine Shop', 'Parts Making']);
    expect(otherLineChoices(['Machine Shop', 'Paint Shop', 'Parts Making'])).toEqual([]);
    expect(linesToShow(['Paint Shop'], '')).toEqual(['Paint Shop']);
    expect(linesToShow(['Paint Shop'], 'Parts Making')).toEqual(['Parts Making']);
    expect(linesToShow(['Paint Shop'], 'Trim')).toEqual(['Paint Shop']);
  });

  it('is granted by the "otherlines" supplementary role, or by being a supervisor or above', () => {
    expect(mayWorkOtherLines('user', [])).toBe(false);
    expect(mayWorkOtherLines('user', ['cee'])).toBe(false);
    expect(mayWorkOtherLines('user', ['otherlines'])).toBe(true);
    expect(mayWorkOtherLines('supervisor', [])).toBe(true);
    expect(mayWorkOtherLines('systemadmin', null)).toBe(true);
  });

  it('a general user without the grant sees only their own line and no picker', async () => {
    localStorage.setItem('kmc_role', 'user'); localStorage.removeItem('kmc_roles');
    const { default: MyJobOrders } = await import('../components/jobs/MyJobOrders');
    render(<MyJobOrders catalog={{}} lockedCodes={['P01-01']} onStart={() => {}} />);
    expect(screen.getByText('OP-2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Work on another line')).toBeNull();
    localStorage.setItem('kmc_roles', JSON.stringify(['otherlines']));
  });

  it('with the grant, My job orders defaults to their own line, then lists the picked line and starts on its stations', async () => {
    const { default: MyJobOrders } = await import('../components/jobs/MyJobOrders');
    render(<MyJobOrders catalog={{}} lockedCodes={['P01-01']} onStart={() => {}} />);
    expect(screen.getByText('OP-2')).toBeInTheDocument();
    expect(screen.queryByText('OP-3')).toBeNull();
    fireEvent.change(screen.getByLabelText('Work on another line'), { target: { value: 'Parts Making' } });
    expect(screen.getByText('OP-3')).toBeInTheDocument();
    expect(screen.queryByText('OP-2')).toBeNull();
    expect(screen.getByText('Working on Parts Making, not your own line')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start'));
    expect(screen.getByText('OP-3')).toBeInTheDocument();   // the start screen for the borrowed line's job
    expect(screen.queryByLabelText('Work on another line')).toBeNull();
  });
});
