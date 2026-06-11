import { describe, expect, it } from 'vitest';
import { OBLIGATIONS, daysUntil, deadlineLabel } from '../src/deadlines.js';

describe('deadlines', () => {
  it('counts days until a future deadline', () => {
    expect(daysUntil('2026-08-02', new Date('2026-06-11T10:00:00Z'))).toBe(52);
  });

  it('returns 0 on the deadline day and negative after', () => {
    expect(daysUntil('2026-08-02', new Date('2026-08-02T23:00:00Z'))).toBe(0);
    expect(daysUntil('2026-08-02', new Date('2026-08-10T00:00:00Z'))).toBe(-8);
  });

  it('labels in-force obligations', () => {
    expect(deadlineLabel('2026-08-02', new Date('2026-09-01T00:00:00Z'))).toContain('IN FORCE');
    expect(deadlineLabel('2026-12-02', new Date('2026-06-11T00:00:00Z'))).toContain('applies in');
  });

  it('keeps the Digital Omnibus marking delay: Art 50(2) is Dec 2026, the rest Aug 2026', () => {
    expect(OBLIGATIONS['synthetic-content'].deadline).toBe('2026-12-02');
    expect(OBLIGATIONS.interaction.deadline).toBe('2026-08-02');
    expect(OBLIGATIONS['emotion-biometric'].deadline).toBe('2026-08-02');
    expect(OBLIGATIONS['deepfake-text'].deadline).toBe('2026-08-02');
  });
});
