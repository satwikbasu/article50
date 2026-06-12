import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWatchState, saveWatchState } from '../src/watchstate.js';

const dir = () => mkdtempSync(join(tmpdir(), 'a50-watch-'));

describe('watch state', () => {
  it('round-trips the last failing signature across restarts', () => {
    const file = join(dir(), 'state.json');
    saveWatchState(file, 'Art. 50(1), Art. 50(2)');
    expect(loadWatchState(file)).toBe('Art. 50(1), Art. 50(2)');
  });

  it('returns undefined for a missing state file', () => {
    expect(loadWatchState(join(dir(), 'nope.json'))).toBeUndefined();
  });

  it('returns undefined for a corrupted state file instead of crashing', () => {
    const file = join(dir(), 'broken.json');
    writeFileSync(file, '{not json');
    expect(loadWatchState(file)).toBeUndefined();
  });
});
