import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Tiny persistence for `a50 watch`: the last failing-check signature, so a
 * restart (or a cron run with --once) doesn't re-alert on a regression that
 * was already reported.
 */

interface WatchStateFile {
  lastFailing: string;
  updatedAt: string;
}

export function loadWatchState(path: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WatchStateFile>;
    return typeof parsed.lastFailing === 'string' ? parsed.lastFailing : undefined;
  } catch {
    return undefined;
  }
}

export function saveWatchState(path: string, lastFailing: string): void {
  const state: WatchStateFile = { lastFailing, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(state, null, 2));
}
