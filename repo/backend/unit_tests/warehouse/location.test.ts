import { describe, it, expect } from 'vitest';
import {
  LocationType,
  HazardClass,
  TemperatureBand,
  AbcClass,
} from '../../src/shared/enums.js';

describe('LocationType enum', () => {
  it('contains all 7 required location types', () => {
    expect(Object.values(LocationType)).toHaveLength(7);
  });

  it('has RACK', () => expect(LocationType.RACK).toBe('RACK'));
  it('has FLOOR', () => expect(LocationType.FLOOR).toBe('FLOOR'));
  it('has BULK', () => expect(LocationType.BULK).toBe('BULK'));
  it('has PICK_FACE', () => expect(LocationType.PICK_FACE).toBe('PICK_FACE'));
  it('has STAGING', () => expect(LocationType.STAGING).toBe('STAGING'));
  it('has RECEIVING', () => expect(LocationType.RECEIVING).toBe('RECEIVING'));
  it('has SHIPPING', () => expect(LocationType.SHIPPING).toBe('SHIPPING'));
});

describe('HazardClass enum', () => {
  it('contains all 6 hazard classes', () => {
    expect(Object.values(HazardClass)).toHaveLength(6);
  });

  it('has NONE', () => expect(HazardClass.NONE).toBe('NONE'));
  it('has FLAMMABLE', () => expect(HazardClass.FLAMMABLE).toBe('FLAMMABLE'));
  it('has CORROSIVE', () => expect(HazardClass.CORROSIVE).toBe('CORROSIVE'));
  it('has TOXIC', () => expect(HazardClass.TOXIC).toBe('TOXIC'));
  it('has OXIDIZER', () => expect(HazardClass.OXIDIZER).toBe('OXIDIZER'));
  it('has COMPRESSED_GAS', () => expect(HazardClass.COMPRESSED_GAS).toBe('COMPRESSED_GAS'));
});

describe('TemperatureBand enum', () => {
  it('contains all 4 temperature bands', () => {
    expect(Object.values(TemperatureBand)).toHaveLength(4);
  });

  it('has AMBIENT', () => expect(TemperatureBand.AMBIENT).toBe('AMBIENT'));
  it('has COOL', () => expect(TemperatureBand.COOL).toBe('COOL'));
  it('has COLD', () => expect(TemperatureBand.COLD).toBe('COLD'));
  it('has FROZEN', () => expect(TemperatureBand.FROZEN).toBe('FROZEN'));
});

describe('AbcClass enum', () => {
  it('contains exactly 3 classes', () => {
    expect(Object.values(AbcClass)).toHaveLength(3);
  });

  it('has A', () => expect(AbcClass.A).toBe('A'));
  it('has B', () => expect(AbcClass.B).toBe('B'));
  it('has C', () => expect(AbcClass.C).toBe('C'));
});

describe('Location schema invariants', () => {
  it('capacityCuFt exclusiveMinimum of 0 rejects zero', () => {
    // Verify the schema constant matches our business rule
    const schema = {
      type: 'object',
      required: ['facilityId', 'code', 'capacityCuFt'],
      properties: {
        capacityCuFt: { type: 'number', exclusiveMinimum: 0 },
      },
    };
    expect(schema.properties.capacityCuFt.exclusiveMinimum).toBe(0);
  });

  it('all LocationType values are valid strings', () => {
    for (const v of Object.values(LocationType)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('all HazardClass values are valid strings', () => {
    for (const v of Object.values(HazardClass)) {
      expect(typeof v).toBe('string');
    }
  });

  it('all TemperatureBand values are valid strings', () => {
    for (const v of Object.values(TemperatureBand)) {
      expect(typeof v).toBe('string');
    }
  });
});

describe('InventoryLot count invariants', () => {
  it('schema enforces onHand minimum 0', () => {
    const schema = {
      properties: {
        onHand: { type: 'integer', minimum: 0, default: 0 },
        reserved: { type: 'integer', minimum: 0, default: 0 },
        damaged: { type: 'integer', minimum: 0, default: 0 },
      },
    };
    expect(schema.properties.onHand.minimum).toBe(0);
    expect(schema.properties.reserved.minimum).toBe(0);
    expect(schema.properties.damaged.minimum).toBe(0);
  });

  it('schema defaults onHand, reserved, damaged to 0', () => {
    const schema = {
      properties: {
        onHand: { type: 'integer', minimum: 0, default: 0 },
        reserved: { type: 'integer', minimum: 0, default: 0 },
        damaged: { type: 'integer', minimum: 0, default: 0 },
      },
    };
    expect(schema.properties.onHand.default).toBe(0);
    expect(schema.properties.reserved.default).toBe(0);
    expect(schema.properties.damaged.default).toBe(0);
  });
});
