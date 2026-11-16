import { describe, it, expect } from 'vitest';
import { mergeProjectVins } from '../utils/catalogGuard';

const v = (...vins) => vins.map(vin => ({ vin, model: '7m EVS' }));

// A Catalog Admin save must not wipe VINs uploaded on the VIN Register while
// the editor was open (it saves the whole catalog as it was when opened).
describe('keeping VIN lists on a Catalog Admin save', () => {
  const opened = { 'A': v('1'), 'B': [] };

  it('keeps VINs uploaded meanwhile when the admin did not touch that project', () => {
    const live = { 'A': v('1'), 'B': v('9', '10') };
    expect(mergeProjectVins(opened, opened, live)).toEqual(live);
  });

  it("keeps the admin's own edits to a project", () => {
    const draft = { 'A': v('1', '2'), 'B': [] };
    const live = { 'A': v('1'), 'B': v('9') };
    expect(mergeProjectVins(opened, draft, live)).toEqual({ 'A': v('1', '2'), 'B': v('9') });
  });

  it('adds a project the server does not have yet, and keeps server-only projects', () => {
    const draft = { ...opened, 'New': v('5') };
    const live = { 'A': v('1'), 'B': [], 'Other': v('7') };
    expect(mergeProjectVins(opened, draft, live)).toEqual({ 'A': v('1'), 'B': [], 'New': v('5'), 'Other': v('7') });
  });

  it('falls back to the draft when the server could not be read', () => {
    expect(mergeProjectVins(opened, { 'A': [] }, null)).toEqual({ 'A': [] });
  });
});
