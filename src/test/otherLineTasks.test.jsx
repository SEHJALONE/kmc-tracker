import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BUS_MODELS } from '../utils/tcCatalog';

// Bus Start/End tasks: a granted person may leave their assigned stations and
// pick another line's station; everyone else stays on their own stations.
vi.mock('../hooks/useStationTimes', () => ({ fetchStationTimes: () => Promise.reject(new Error('offline')) }));

const catalog = { projects: [{ name: 'Project A', active: true }] };

async function setup(canPickLine) {
  const { TaskSetup } = await import('../components/TaskRunner');
  render(<TaskSetup catalog={catalog} lockedCodes={['P02-03']} canPickLine={canPickLine} onStart={() => {}} onCancel={() => {}} />);
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[1], { target: { value: BUS_MODELS[0] } });
}

describe('bus tasks on another line', () => {
  it('without the grant: no switch, and no line choice (assigned stations only)', async () => {
    await setup(false);
    expect(screen.queryByText('Work on another line')).toBeNull();
    expect(screen.queryByText('Production line')).toBeNull();
    expect(screen.getByText('Station (assigned to you)')).toBeInTheDocument();
  });

  it('with the grant: starts on their stations, then lets them pick any line and back', async () => {
    await setup(true);
    expect(screen.getByText('Station (assigned to you)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Work on another line'));
    expect(screen.getByText('Production line')).toBeInTheDocument();
    expect(screen.getByText('Working on another line, not your assigned stations')).toBeInTheDocument();
    expect(screen.getByText('Station')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Back to my stations'));
    expect(screen.queryByText('Production line')).toBeNull();
    expect(screen.getByText('Station (assigned to you)')).toBeInTheDocument();
  });
});
