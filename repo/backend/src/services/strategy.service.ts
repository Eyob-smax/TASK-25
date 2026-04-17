import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '../shared/envelope.js';
import { SIMULATION_DEFAULTS } from '../shared/types.js';
import { auditCreate, auditUpdate } from '../audit/audit.js';
import {
  createRuleset as repoCreateRuleset,
  findRulesetById,
  listRulesets as repoListRulesets,
  updateRuleset as repoUpdateRuleset,
  findActiveRuleset,
  findLocationsForFacility,
  findRecentPickTasksAtLocation,
  findInventoryLotsForSku,
  findPickTasksForSimulation,
} from '../repositories/strategy.repository.js';
import { findFacilityById, findSkuById } from '../repositories/warehouse.repository.js';
import { findPickTaskById } from '../repositories/outbound.repository.js';

export class StrategyServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StrategyServiceError';
  }
}

// ---- Pure scoring functions (exported for unit testing) ----

/** ABC priority for pick sequencing: A=3, B=2, C=1 */
export function abcPickPriority(abcClass: string): number {
  return abcClass === 'A' ? 3 : abcClass === 'B' ? 2 : 1;
}

/** Path cost by location type — lower value means closer to shipping door (preferred for putaway avoidance, penalised in pick) */
export function pathCostScore(locationType: string): number {
  const costs: Record<string, number> = {
    SHIPPING: 0,
    STAGING: 1,
    PICK_FACE: 2,
    RECEIVING: 3,
    RACK: 4,
    FLOOR: 5,
    BULK: 6,
  };
  return costs[locationType] ?? 4;
}

/** How well an ABC class aligns with a given location type for putaway */
export function abcPutawayAlignmentScore(abcClass: string, locationType: string): number {
  if (abcClass === 'A') {
    return locationType === 'PICK_FACE' ? 10 : locationType === 'STAGING' ? 7 : locationType === 'RACK' ? 4 : 1;
  }
  if (abcClass === 'B') {
    return locationType === 'RACK' ? 8 : locationType === 'FLOOR' ? 5 : 2;
  }
  // C-class
  return locationType === 'BULK' ? 8 : locationType === 'RACK' ? 5 : 2;
}

/** Composite putaway score for a location (higher = more preferred) */
export function computePutawayScore(
  sku: { abcClass: string },
  location: { type: string },
  heatScore: number,
  ruleset: { abcWeight: number; heatLevelWeight: number; pathCostWeight: number },
): number {
  return (
    ruleset.abcWeight * abcPutawayAlignmentScore(sku.abcClass, location.type) +
    ruleset.heatLevelWeight * heatScore -
    ruleset.pathCostWeight * pathCostScore(location.type)
  );
}

/** Composite pick score for a task (higher = picked sooner, lower sequence number) */
export function computePickScore(
  locationType: string,
  lot: { createdAt: Date; expirationDate: Date | null },
  sku: { abcClass: string },
  ruleset: { fifoWeight: number; fefoWeight: number; abcWeight: number; pathCostWeight: number },
  now: Date,
): number {
  // FIFO: older lot → more days old → higher score
  const ageMs = now.getTime() - lot.createdAt.getTime();
  const fifoScore = ageMs / (1000 * 3600 * 24);

  // FEFO: sooner expiry → higher urgency → higher score
  let fefoScore = 0;
  if (lot.expirationDate) {
    const daysToExpiry = (lot.expirationDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
    fefoScore = daysToExpiry > 0 ? 1000 / daysToExpiry : 10000;
  }

  // Path cost: penalise high path cost locations (pick faster from nearby locations)
  return (
    ruleset.fifoWeight * fifoScore +
    ruleset.fefoWeight * fefoScore +
    ruleset.abcWeight * abcPickPriority(sku.abcClass) -
    ruleset.pathCostWeight * pathCostScore(locationType)
  );
}

// ---- Ruleset CRUD ----

export async function createRuleset(
  prisma: PrismaClient,
  data: {
    name: string;
    description?: string;
    fifoWeight?: number;
    fefoWeight?: number;
    abcWeight?: number;
    heatLevelWeight?: number;
    pathCostWeight?: number;
  },
  actorId: string,
) {
  const ruleset = await repoCreateRuleset(prisma, {
    name: data.name,
    description: data.description,
    fifoWeight: data.fifoWeight ?? 1.0,
    fefoWeight: data.fefoWeight ?? 0.0,
    abcWeight: data.abcWeight ?? 1.0,
    heatLevelWeight: data.heatLevelWeight ?? 1.0,
    pathCostWeight: data.pathCostWeight ?? 1.0,
    createdBy: actorId,
  });
  await auditCreate(prisma, actorId, 'StrategyRuleset', ruleset.id, ruleset);
  return ruleset;
}

export async function getRuleset(prisma: PrismaClient, rulesetId: string) {
  const ruleset = await findRulesetById(prisma, rulesetId);
  if (!ruleset) throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'Ruleset not found');
  return ruleset;
}

export async function listRulesets(
  prisma: PrismaClient,
  opts: { includeInactive?: boolean } = {},
) {
  return repoListRulesets(prisma, opts);
}

export async function updateRuleset(
  prisma: PrismaClient,
  rulesetId: string,
  data: {
    name?: string;
    description?: string;
    fifoWeight?: number;
    fefoWeight?: number;
    abcWeight?: number;
    heatLevelWeight?: number;
    pathCostWeight?: number;
    isActive?: boolean;
  },
  actorId: string,
) {
  const before = await findRulesetById(prisma, rulesetId);
  if (!before) throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'Ruleset not found');
  const after = await repoUpdateRuleset(prisma, rulesetId, data);
  await auditUpdate(prisma, actorId, 'StrategyRuleset', rulesetId, before, after);
  return after;
}

// ---- Putaway ranking ----

export async function rankPutawayLocations(
  prisma: PrismaClient,
  data: {
    facilityId: string;
    skuId: string;
    quantity: number;
    rulesetId?: string;
    lotNumber?: string;
    expirationDate?: Date;
  },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'Facility not found');

  const sku = await findSkuById(prisma, data.skuId);
  if (!sku) throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'SKU not found');

  const ruleset = data.rulesetId
    ? await findRulesetById(prisma, data.rulesetId)
    : await findActiveRuleset(prisma);
  if (!ruleset) {
    throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'No active ruleset found — create one first');
  }

  const locations = await findLocationsForFacility(prisma, data.facilityId);

  // Compatibility filter
  const compatible = locations.filter((loc) => {
    const hazardOk =
      loc.hazardClass === 'NONE' ||
      sku.hazardClass === 'NONE' ||
      loc.hazardClass === sku.hazardClass;
    const tempOk = loc.temperatureBand === sku.temperatureBand;
    return hazardOk && tempOk;
  });

  const now = new Date();
  const heatSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const ranked = await Promise.all(
    compatible.map(async (loc) => {
      const heatScore = await findRecentPickTasksAtLocation(prisma, loc.id, heatSince);
      const score = computePutawayScore(sku, loc, heatScore, ruleset);
      return { location: loc, score, heatScore };
    }),
  );

  ranked.sort((a, b) => b.score - a.score);
  return { ruleset, ranked: ranked.slice(0, 10) };
}

// ---- Pick-path planning ----

export async function planPickPath(
  prisma: PrismaClient,
  data: { facilityId: string; pickTaskIds: string[]; rulesetId?: string },
  actorId: string,
) {
  const facility = await findFacilityById(prisma, data.facilityId);
  if (!facility) throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'Facility not found');

  const ruleset = data.rulesetId
    ? await findRulesetById(prisma, data.rulesetId)
    : await findActiveRuleset(prisma);
  if (!ruleset) {
    throw new StrategyServiceError(ErrorCode.NOT_FOUND, 'No active ruleset found — create one first');
  }

  const now = new Date();
  const scoredTasks = [];

  for (const taskId of data.pickTaskIds) {
    const task = await findPickTaskById(prisma, taskId);
    if (!task) throw new StrategyServiceError(ErrorCode.NOT_FOUND, `Pick task not found: ${taskId}`);

    // Find oldest available lot for FIFO scoring
    const lots = await findInventoryLotsForSku(prisma, task.skuId, task.locationId);
    const lot = lots[0] ?? { createdAt: new Date(0), expirationDate: null };

    const score = computePickScore(task.location.type, lot, task.sku, ruleset, now);
    scoredTasks.push({ task, score });
  }

  // Sort descending (higher score = picked first = lower sequence number)
  scoredTasks.sort((a, b) => b.score - a.score);

  return {
    ruleset,
    tasks: scoredTasks.map((s, idx) => ({ ...s.task, suggestedSequence: idx + 1, score: s.score })),
  };
}

/**
 * Proxy distance between two adjacent pick-task touches during simulation.
 *
 * The unit is an abstract "pick-step cost" (not meters) and is derived from
 * real Location fields rather than an opaque string-prefix heuristic:
 *
 *   - same `locationId`                → 0   (no travel)
 *   - same `zoneId` (both non-null)    → 0.5 (intra-zone traverse)
 *   - different zone, same facility    → 1.0 (inter-zone traverse)
 *   - missing zone information         → 1.0 (conservative default)
 *
 * The path-cost differential between the two location types is layered on
 * top as a secondary term (each step of `pathCostScore` difference adds
 * 0.1) so moving between "PICK_FACE ↔ BULK" is penalized more than moving
 * between two RACKs. Pure function exported for unit testing.
 */
export function estimatePickStepDistance(
  prev: { id: string; zoneId: string | null; type: string },
  curr: { id: string; zoneId: string | null; type: string },
): number {
  if (prev.id === curr.id) return 0;

  let base: number;
  if (prev.zoneId && curr.zoneId && prev.zoneId === curr.zoneId) {
    base = 0.5;
  } else {
    base = 1.0;
  }

  const typeDelta = Math.abs(pathCostScore(prev.type) - pathCostScore(curr.type));
  return base + typeDelta * 0.1;
}

// ---- Simulation ----

export async function runSimulation(
  prisma: PrismaClient,
  data: { facilityId: string; rulesetIds: string[]; windowDays?: number },
  actorId: string,
) {
  const windowDays = data.windowDays ?? SIMULATION_DEFAULTS.windowDays;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const tasks = await findPickTasksForSimulation(prisma, data.facilityId, since);
  if (tasks.length === 0) {
    return { windowDays, totalTasks: 0, results: [] };
  }

  const results = [];
  const now = new Date();

  for (const rulesetId of data.rulesetIds) {
    const ruleset = await findRulesetById(prisma, rulesetId);
    if (!ruleset) {
      results.push({ rulesetId, error: 'Ruleset not found' });
      continue;
    }

    // Score and re-sequence historical tasks
    const scoredTasks = tasks.map((task) => {
      const lot = { createdAt: task.createdAt, expirationDate: null as Date | null };
      const score = computePickScore(task.location.type, lot, task.sku, ruleset, now);
      return { task, score };
    });
    scoredTasks.sort((a, b) => b.score - a.score);

    // Metrics — structural proxy distance using real Location.zoneId and
    // Location.type fields rather than a string-prefix heuristic.
    let estimatedTotalDistance = 0;
    for (let i = 1; i < scoredTasks.length; i++) {
      estimatedTotalDistance += estimatePickStepDistance(
        scoredTasks[i - 1].task.location,
        scoredTasks[i].task.location,
      );
    }

    const totalTouches = tasks.length;
    const constraintViolations = tasks.filter((t) => {
      const locHazard = t.location.hazardClass;
      const skuHazard = t.sku.hazardClass;
      return locHazard !== 'NONE' && skuHazard !== 'NONE' && locHazard !== skuHazard;
    }).length;

    results.push({
      rulesetId,
      rulesetName: ruleset.name,
      totalTouches,
      estimatedTotalDistance: Math.round(estimatedTotalDistance * 100) / 100,
      constraintViolations,
    });
  }

  return { windowDays, totalTasks: tasks.length, results };
}
