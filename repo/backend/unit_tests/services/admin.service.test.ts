import { describe, expect, it } from 'vitest';
import {
  addIpAllowlistEntry,
  AdminServiceError,
  purgeBillingRecords,
  purgeOperationalLogs,
  restoreBackup,
} from '../../src/services/admin.service.js';

describe('admin.service', () => {
  it('addIpAllowlistEntry rejects invalid CIDR format', async () => {
    await expect(
      addIpAllowlistEntry(
        {} as never,
        {
          cidr: 'invalid-cidr',
          routeGroup: 'admin',
        },
        'actor-1',
      ),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });
  });

  it('addIpAllowlistEntry rejects non-canonical CIDR prefixes', async () => {
    await expect(
      addIpAllowlistEntry(
        {} as never,
        {
          cidr: '192.168.1.0/08',
          routeGroup: 'admin',
        },
        'actor-1',
      ),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });

    await expect(
      addIpAllowlistEntry(
        {} as never,
        {
          cidr: '192.168.1.0/+8',
          routeGroup: 'admin',
        },
        'actor-1',
      ),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });
  });

  it('purgeBillingRecords without confirm=true is rejected before any DB work', async () => {
    await expect(
      purgeBillingRecords({} as never, 'actor-1', false),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });
  });

  it('purgeOperationalLogs without confirm=true is rejected before any DB work', async () => {
    await expect(
      purgeOperationalLogs({} as never, 'actor-1', false),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });
  });

  it('restoreBackup without confirm=true is rejected before any filesystem access', async () => {
    await expect(
      restoreBackup(
        {} as never,
        'snapshot-1',
        'file:./test.db',
        './backups',
        Buffer.alloc(32),
        'actor-1',
        false,
      ),
    ).rejects.toMatchObject<Partial<AdminServiceError>>({
      code: 'VALIDATION_FAILED',
    });
  });
});
