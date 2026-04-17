import { describe, it, expect } from 'vitest';
import {
  isValidArticleTransition,
  getAllowedArticleTransitions,
  isArticleScheduledPublishEligible,
} from '../../src/shared/invariants.js';

describe('isValidArticleTransition', () => {
  it('DRAFT → IN_REVIEW is valid', () => {
    expect(isValidArticleTransition('DRAFT', 'IN_REVIEW')).toBe(true);
  });

  it('IN_REVIEW → APPROVED is valid', () => {
    expect(isValidArticleTransition('IN_REVIEW', 'APPROVED')).toBe(true);
  });

  it('IN_REVIEW → DRAFT is valid (reject)', () => {
    expect(isValidArticleTransition('IN_REVIEW', 'DRAFT')).toBe(true);
  });

  it('APPROVED → PUBLISHED is valid', () => {
    expect(isValidArticleTransition('APPROVED', 'PUBLISHED')).toBe(true);
  });

  it('APPROVED → SCHEDULED is valid', () => {
    expect(isValidArticleTransition('APPROVED', 'SCHEDULED')).toBe(true);
  });

  it('SCHEDULED → PUBLISHED is valid (auto-publish)', () => {
    expect(isValidArticleTransition('SCHEDULED', 'PUBLISHED')).toBe(true);
  });

  it('SCHEDULED → WITHDRAWN is valid (cancel schedule)', () => {
    expect(isValidArticleTransition('SCHEDULED', 'WITHDRAWN')).toBe(true);
  });

  it('PUBLISHED → WITHDRAWN is valid', () => {
    expect(isValidArticleTransition('PUBLISHED', 'WITHDRAWN')).toBe(true);
  });

  it('WITHDRAWN → DRAFT is valid (reactivate)', () => {
    expect(isValidArticleTransition('WITHDRAWN', 'DRAFT')).toBe(true);
  });

  it('DRAFT → PUBLISHED is invalid (skip review)', () => {
    expect(isValidArticleTransition('DRAFT', 'PUBLISHED')).toBe(false);
  });

  it('PUBLISHED → DRAFT is invalid (terminal)', () => {
    expect(isValidArticleTransition('PUBLISHED', 'DRAFT')).toBe(false);
  });

  it('APPROVED → DRAFT is invalid', () => {
    expect(isValidArticleTransition('APPROVED', 'DRAFT')).toBe(false);
  });

  it('unknown state → any returns false', () => {
    expect(isValidArticleTransition('UNKNOWN', 'DRAFT')).toBe(false);
  });

  it('any → unknown state returns false', () => {
    expect(isValidArticleTransition('DRAFT', 'NONEXISTENT')).toBe(false);
  });
});

describe('getAllowedArticleTransitions', () => {
  it('DRAFT allows only IN_REVIEW', () => {
    expect(getAllowedArticleTransitions('DRAFT')).toEqual(['IN_REVIEW']);
  });

  it('PUBLISHED allows only WITHDRAWN', () => {
    expect(getAllowedArticleTransitions('PUBLISHED')).toEqual(['WITHDRAWN']);
  });

  it('IN_REVIEW allows APPROVED and DRAFT', () => {
    const allowed = getAllowedArticleTransitions('IN_REVIEW');
    expect(allowed).toContain('APPROVED');
    expect(allowed).toContain('DRAFT');
    expect(allowed).toHaveLength(2);
  });

  it('unknown state returns empty array', () => {
    expect(getAllowedArticleTransitions('unknown')).toEqual([]);
  });
});

describe('isArticleScheduledPublishEligible', () => {
  const now = new Date('2026-04-16T12:00:00Z');
  const past = new Date('2026-04-16T10:00:00Z');
  const future = new Date('2026-04-16T14:00:00Z');

  it('returns true when SCHEDULED and scheduledPublishAt is in the past', () => {
    expect(isArticleScheduledPublishEligible('SCHEDULED', past, now)).toBe(true);
  });

  it('returns false when SCHEDULED and scheduledPublishAt is in the future', () => {
    expect(isArticleScheduledPublishEligible('SCHEDULED', future, now)).toBe(false);
  });

  it('returns false when SCHEDULED and scheduledPublishAt is null', () => {
    expect(isArticleScheduledPublishEligible('SCHEDULED', null, now)).toBe(false);
  });

  it('returns false when state is PUBLISHED (even with past date)', () => {
    expect(isArticleScheduledPublishEligible('PUBLISHED', past, now)).toBe(false);
  });

  it('returns false when state is DRAFT', () => {
    expect(isArticleScheduledPublishEligible('DRAFT', past, now)).toBe(false);
  });

  it('returns true when scheduledPublishAt exactly equals now', () => {
    expect(isArticleScheduledPublishEligible('SCHEDULED', now, now)).toBe(true);
  });
});
