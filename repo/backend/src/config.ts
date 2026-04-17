export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  nodeEnv: string;
  logLevel: string;
  // Security
  encryptionMasterKey: string;   // hex-encoded 32-byte master key (ENCRYPTION_MASTER_KEY)
  sessionTimeoutHours: number;   // session lifetime in hours
  loginMaxAttempts: number;      // failed login attempts before throttle
  loginWindowMinutes: number;    // window for login attempt counting
  // Operational
  backupDir?: string;            // local directory for encrypted backup snapshots
  ipAllowlistStrictMode?: boolean; // when true, empty active allowlist denies all; default false
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const config: AppConfig = {
    port: parseInt(env.PORT ?? '3000', 10),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL ?? 'file:../database/greencycle.db',
    nodeEnv: env.NODE_ENV ?? 'development',
    logLevel: env.LOG_LEVEL ?? 'info',
    encryptionMasterKey: env.ENCRYPTION_MASTER_KEY ?? '',
    sessionTimeoutHours: parseInt(env.SESSION_TIMEOUT_HOURS ?? '8', 10),
    loginMaxAttempts: parseInt(env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
    loginWindowMinutes: parseInt(env.LOGIN_WINDOW_MINUTES ?? '15', 10),
    backupDir: env.BACKUP_DIR ?? '../backups',
    // Fail-closed by default: empty active allowlist denies all for privileged
    // route groups. Operators must explicitly set IP_ALLOWLIST_STRICT_MODE=false
    // to restore the legacy open-by-default posture (only recommended for
    // fully-offline/air-gapped single-node dev bootstraps).
    ipAllowlistStrictMode: (env.IP_ALLOWLIST_STRICT_MODE ?? 'true').toLowerCase() !== 'false',
  };
  assertEncryptionKeyOrFail(config);
  return config;
}

/**
 * Refuse to boot with a missing or malformed ENCRYPTION_MASTER_KEY outside the
 * test environment. This closes the prior silent zero-key fallback that would
 * have encrypted sensitive fields under a predictable default.
 */
export function assertEncryptionKeyOrFail(config: AppConfig): void {
  if (config.nodeEnv === 'test') return;
  if (!HEX_KEY_PATTERN.test(config.encryptionMasterKey)) {
    throw new ConfigError(
      'ENCRYPTION_MASTER_KEY must be set to a 64-hex-character (32-byte) value. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
}
