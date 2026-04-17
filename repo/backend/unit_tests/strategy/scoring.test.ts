import { describe, it, expect } from 'vitest';
import {
  abcPickPriority,
  pathCostScore,
  abcPutawayAlignmentScore,
  computePutawayScore,
  computePickScore,
  estimatePickStepDistance,
} from '../../src/services/strategy.service.js';

describe('abcPickPriority', () => {
  it('A → 3', () => expect(abcPickPriority('A')).toBe(3));
  it('B → 2', () => expect(abcPickPriority('B')).toBe(2));
  it('C → 1', () => expect(abcPickPriority('C')).toBe(1));
  it('unknown class → 1 (default)', () => expect(abcPickPriority('X')).toBe(1));
});

describe('pathCostScore', () => {
  it('SHIPPING → 0 (lowest cost, at door)', () => expect(pathCostScore('SHIPPING')).toBe(0));
  it('STAGING → 1', () => expect(pathCostScore('STAGING')).toBe(1));
  it('PICK_FACE → 2', () => expect(pathCostScore('PICK_FACE')).toBe(2));
  it('RECEIVING → 3', () => expect(pathCostScore('RECEIVING')).toBe(3));
  it('RACK → 4', () => expect(pathCostScore('RACK')).toBe(4));
  it('FLOOR → 5', () => expect(pathCostScore('FLOOR')).toBe(5));
  it('BULK → 6 (highest cost, deepest in warehouse)', () => expect(pathCostScore('BULK')).toBe(6));
  it('unknown type → defaults to 4', () => expect(pathCostScore('UNKNOWN')).toBe(4));
});

describe('abcPutawayAlignmentScore', () => {
  it('A-class to PICK_FACE → highest alignment (10)', () => {
    expect(abcPutawayAlignmentScore('A', 'PICK_FACE')).toBe(10);
  });

  it('A-class to STAGING → good alignment (7)', () => {
    expect(abcPutawayAlignmentScore('A', 'STAGING')).toBe(7);
  });

  it('A-class to BULK → low alignment (1)', () => {
    expect(abcPutawayAlignmentScore('A', 'BULK')).toBe(1);
  });

  it('B-class to RACK → best for B (8)', () => {
    expect(abcPutawayAlignmentScore('B', 'RACK')).toBe(8);
  });

  it('C-class to BULK → best for C (8)', () => {
    expect(abcPutawayAlignmentScore('C', 'BULK')).toBe(8);
  });

  it('C-class to PICK_FACE → low alignment (2)', () => {
    expect(abcPutawayAlignmentScore('C', 'PICK_FACE')).toBe(2);
  });
});

describe('computePutawayScore', () => {
  const defaultRuleset = { abcWeight: 1, heatLevelWeight: 1, pathCostWeight: 1 };

  it('A-class SKU scores higher at PICK_FACE than BULK', () => {
    const sku = { abcClass: 'A' };
    const pickFace = { type: 'PICK_FACE' };
    const bulk = { type: 'BULK' };
    const scorePF = computePutawayScore(sku, pickFace, 0, defaultRuleset);
    const scoreBulk = computePutawayScore(sku, bulk, 0, defaultRuleset);
    expect(scorePF).toBeGreaterThan(scoreBulk);
  });

  it('C-class SKU scores higher at BULK than PICK_FACE', () => {
    const sku = { abcClass: 'C' };
    const pickFace = { type: 'PICK_FACE' };
    const bulk = { type: 'BULK' };
    const scorePF = computePutawayScore(sku, pickFace, 0, defaultRuleset);
    const scoreBulk = computePutawayScore(sku, bulk, 0, defaultRuleset);
    expect(scoreBulk).toBeGreaterThan(scorePF);
  });

  it('higher heat score increases putaway score', () => {
    const sku = { abcClass: 'B' };
    const loc = { type: 'RACK' };
    const lowHeat = computePutawayScore(sku, loc, 0, defaultRuleset);
    const highHeat = computePutawayScore(sku, loc, 10, defaultRuleset);
    expect(highHeat).toBeGreaterThan(lowHeat);
  });

  it('higher pathCostWeight penalises far locations more', () => {
    const sku = { abcClass: 'B' };
    const nearLoc = { type: 'STAGING' };   // pathCost=1
    const farLoc = { type: 'BULK' };       // pathCost=6
    const highPathCostRuleset = { abcWeight: 0, heatLevelWeight: 0, pathCostWeight: 5 };
    const nearScore = computePutawayScore(sku, nearLoc, 0, highPathCostRuleset);
    const farScore = computePutawayScore(sku, farLoc, 0, highPathCostRuleset);
    expect(nearScore).toBeGreaterThan(farScore);
  });
});

describe('computePickScore', () => {
  const defaultRuleset = { fifoWeight: 1, fefoWeight: 0, abcWeight: 1, pathCostWeight: 1 };
  const now = new Date('2026-04-16T12:00:00Z');

  it('A-class item scores higher than C-class item (same lot, same location)', () => {
    const lot = { createdAt: new Date('2026-04-01T00:00:00Z'), expirationDate: null };
    const scoreA = computePickScore('RACK', lot, { abcClass: 'A' }, defaultRuleset, now);
    const scoreC = computePickScore('RACK', lot, { abcClass: 'C' }, defaultRuleset, now);
    expect(scoreA).toBeGreaterThan(scoreC);
  });

  it('FIFO: older lot scores higher when fifoWeight > 0', () => {
    const oldLot = { createdAt: new Date('2026-01-01T00:00:00Z'), expirationDate: null };
    const newLot = { createdAt: new Date('2026-04-15T00:00:00Z'), expirationDate: null };
    const sku = { abcClass: 'B' };
    const scoreOld = computePickScore('RACK', oldLot, sku, defaultRuleset, now);
    const scoreNew = computePickScore('RACK', newLot, sku, defaultRuleset, now);
    expect(scoreOld).toBeGreaterThan(scoreNew);
  });

  it('FEFO: sooner expiry scores higher when fefoWeight > 0', () => {
    const fefoRuleset = { fifoWeight: 0, fefoWeight: 1, abcWeight: 0, pathCostWeight: 0 };
    const soonExpiry = { createdAt: now, expirationDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) };
    const laterExpiry = { createdAt: now, expirationDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000) };
    const sku = { abcClass: 'B' };
    const scoreSoon = computePickScore('RACK', soonExpiry, sku, fefoRuleset, now);
    const scoreLater = computePickScore('RACK', laterExpiry, sku, fefoRuleset, now);
    expect(scoreSoon).toBeGreaterThan(scoreLater);
  });

  it('nearby location (STAGING) scores higher than far location (BULK) when pathCostWeight > 0', () => {
    const lot = { createdAt: new Date('2026-04-01T00:00:00Z'), expirationDate: null };
    const sku = { abcClass: 'B' };
    const pathOnlyRuleset = { fifoWeight: 0, fefoWeight: 0, abcWeight: 0, pathCostWeight: 1 };
    const scoreNear = computePickScore('STAGING', lot, sku, pathOnlyRuleset, now);
    const scoreFar = computePickScore('BULK', lot, sku, pathOnlyRuleset, now);
    expect(scoreNear).toBeGreaterThan(scoreFar);
  });

  it('expired lot (past expirationDate) gets highest fefo score', () => {
    const fefoRuleset = { fifoWeight: 0, fefoWeight: 1, abcWeight: 0, pathCostWeight: 0 };
    const expiredLot = { createdAt: now, expirationDate: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    const validLot = { createdAt: now, expirationDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
    const sku = { abcClass: 'B' };
    const scoreExpired = computePickScore('RACK', expiredLot, sku, fefoRuleset, now);
    const scoreValid = computePickScore('RACK', validLot, sku, fefoRuleset, now);
    expect(scoreExpired).toBeGreaterThan(scoreValid);
  });
});

describe('estimatePickStepDistance', () => {
  const sameLoc = { id: 'loc-a', zoneId: 'zone-1', type: 'RACK' };

  it('returns 0 when the two touches are at the exact same location', () => {
    expect(estimatePickStepDistance(sameLoc, { ...sameLoc })).toBe(0);
  });

  it('returns ~0.5 for two locations in the same zone with identical type', () => {
    const a = { id: 'loc-a', zoneId: 'zone-1', type: 'RACK' };
    const b = { id: 'loc-b', zoneId: 'zone-1', type: 'RACK' };
    expect(estimatePickStepDistance(a, b)).toBe(0.5);
  });

  it('returns ~1.0 for two locations in different zones with identical type', () => {
    const a = { id: 'loc-a', zoneId: 'zone-1', type: 'RACK' };
    const b = { id: 'loc-b', zoneId: 'zone-2', type: 'RACK' };
    expect(estimatePickStepDistance(a, b)).toBe(1.0);
  });

  it('falls back to inter-zone distance when zone information is missing', () => {
    const a = { id: 'loc-a', zoneId: null, type: 'RACK' };
    const b = { id: 'loc-b', zoneId: 'zone-2', type: 'RACK' };
    expect(estimatePickStepDistance(a, b)).toBe(1.0);
  });

  it('adds a type-delta penalty so PICK_FACE ↔ BULK is costlier than RACK ↔ RACK', () => {
    const pickFace = { id: 'loc-a', zoneId: 'z', type: 'PICK_FACE' }; // pathCost 2
    const bulk = { id: 'loc-b', zoneId: 'z', type: 'BULK' };          // pathCost 6
    const rackA = { id: 'loc-c', zoneId: 'z', type: 'RACK' };
    const rackB = { id: 'loc-d', zoneId: 'z', type: 'RACK' };
    expect(estimatePickStepDistance(pickFace, bulk)).toBeGreaterThan(
      estimatePickStepDistance(rackA, rackB),
    );
  });

  it('is symmetric in its arguments', () => {
    const a = { id: 'loc-a', zoneId: 'z1', type: 'PICK_FACE' };
    const b = { id: 'loc-b', zoneId: 'z2', type: 'BULK' };
    expect(estimatePickStepDistance(a, b)).toBe(estimatePickStepDistance(b, a));
  });
});
