/**
 * Bootstrap the very first SYSTEM_ADMIN user on a fresh database.
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_USERNAME=admin \
 *   BOOTSTRAP_ADMIN_PASSWORD='ChangeMeStrong123!' \
 *   ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32) \
 *   npm run seed:admin
 *
 * Safe to re-run: if any SYSTEM_ADMIN already exists, the script logs and
 * exits 0 without modifying the database. Otherwise it creates the user,
 * assigns the SYSTEM_ADMIN role, and writes a matching audit event.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config.js';
import { parseMasterKey } from '../security/encryption.js';
import { hashPassword, wrapPasswordHash } from '../security/password.js';
import { getActiveKeyVersion } from '../repositories/keyversion.repository.js';
import { writeAuditEvent } from '../audit/audit.js';
import { AuditAction, Role } from '../shared/enums.js';

const MIN_PASSWORD_LENGTH = 12;

async function main(): Promise<number> {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || username.trim().length === 0) {
    console.error('bootstrap-admin: BOOTSTRAP_ADMIN_USERNAME is required');
    return 2;
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `bootstrap-admin: BOOTSTRAP_ADMIN_PASSWORD is required and must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    return 2;
  }

  const config = loadConfig();
  const masterKey = parseMasterKey(config.encryptionMasterKey);
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

  try {
    const existingAdmin = await prisma.userRole.findFirst({
      where: { role: Role.SYSTEM_ADMIN },
      include: { user: true },
    });
    if (existingAdmin) {
      console.log(
        `bootstrap-admin: SYSTEM_ADMIN already exists (user: ${existingAdmin.user.username}); no action taken.`,
      );
      return 0;
    }

    const usernameConflict = await prisma.user.findUnique({ where: { username } });
    if (usernameConflict) {
      console.error(`bootstrap-admin: username '${username}' already taken by a non-admin user`);
      return 3;
    }

    const activeKey = await getActiveKeyVersion(prisma);
    const keyVersion = activeKey?.version ?? 1;

    const scryptHash = await hashPassword(password);
    const wrapped = wrapPasswordHash(scryptHash, masterKey, keyVersion);

    const userId = randomUUID();
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          username,
          passwordHash: wrapped,
          passwordVersion: 1,
          encryptionKeyVersion: String(keyVersion),
          isActive: true,
        },
      }),
      prisma.userRole.create({
        data: {
          id: randomUUID(),
          userId,
          role: Role.SYSTEM_ADMIN,
          assignedBy: 'BOOTSTRAP',
        },
      }),
    ]);

    await writeAuditEvent({
      prisma,
      actor: 'BOOTSTRAP',
      action: AuditAction.CREATE,
      resourceType: 'User',
      resourceId: userId,
      after: { username, roles: [Role.SYSTEM_ADMIN] },
      metadata: { source: 'bootstrap-admin' },
    });

    console.log(`bootstrap-admin: created SYSTEM_ADMIN '${username}' (id ${userId})`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('bootstrap-admin: unexpected failure', err);
    process.exit(1);
  });
