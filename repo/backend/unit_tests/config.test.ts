import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

describe('loadConfig', () => {
  it('returns default values in test env when no env vars are set', () => {
    const config = loadConfig({ NODE_ENV: 'test' });

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.databaseUrl).toBe('file:../database/greencycle.db');
    expect(config.nodeEnv).toBe('test');
    expect(config.logLevel).toBe('info');
  });

  it('reads port from env', () => {
    const config = loadConfig({ NODE_ENV: 'test', PORT: '4000' });

    expect(config.port).toBe(4000);
  });

  it('reads host from env', () => {
    const config = loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1' });

    expect(config.host).toBe('127.0.0.1');
  });

  it('reads database URL from env', () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'file:/tmp/test.db' });

    expect(config.databaseUrl).toBe('file:/tmp/test.db');
  });

  it('reads node env from env', () => {
    const config = loadConfig({ NODE_ENV: 'production', ENCRYPTION_MASTER_KEY: 'ab'.repeat(32) });

    expect(config.nodeEnv).toBe('production');
  });

  it('reads log level from env', () => {
    const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'debug' });

    expect(config.logLevel).toBe('debug');
  });

  it('handles partial env overrides', () => {
    const config = loadConfig({ NODE_ENV: 'test', PORT: '8080', LOG_LEVEL: 'warn' });

    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('warn');
    expect(config.host).toBe('0.0.0.0');
    expect(config.databaseUrl).toBe('file:../database/greencycle.db');
    expect(config.nodeEnv).toBe('test');
  });

  it('returns empty string for encryptionMasterKey in test env when not set', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.encryptionMasterKey).toBe('');
  });

  it('reads encryptionMasterKey from env', () => {
    const key = 'ab'.repeat(32);
    const config = loadConfig({ NODE_ENV: 'test', ENCRYPTION_MASTER_KEY: key });
    expect(config.encryptionMasterKey).toBe(key);
  });

  it('returns default security values when not set', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.sessionTimeoutHours).toBe(8);
    expect(config.loginMaxAttempts).toBe(5);
    expect(config.loginWindowMinutes).toBe(15);
  });

  it('reads security env vars', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_TIMEOUT_HOURS: '12',
      LOGIN_MAX_ATTEMPTS: '3',
      LOGIN_WINDOW_MINUTES: '30',
    });
    expect(config.sessionTimeoutHours).toBe(12);
    expect(config.loginMaxAttempts).toBe(3);
    expect(config.loginWindowMinutes).toBe(30);
  });

  it('returns default backupDir when BACKUP_DIR not set', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.backupDir).toBe('../backups');
  });

  it('reads backupDir from BACKUP_DIR env', () => {
    const config = loadConfig({ NODE_ENV: 'test', BACKUP_DIR: '/app/backups' });
    expect(config.backupDir).toBe('/app/backups');
  });

  it('docker-equivalent env produces correct container paths', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      ENCRYPTION_MASTER_KEY: 'ab'.repeat(32),
      DATABASE_URL: 'file:/app/database/greencycle.db',
      BACKUP_DIR: '/app/backups',
      PORT: '3000',
      HOST: '0.0.0.0',
    });
    expect(config.databaseUrl).toBe('file:/app/database/greencycle.db');
    expect(config.backupDir).toBe('/app/backups');
    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(3000);
  });

  it('throws in non-test env when ENCRYPTION_MASTER_KEY is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('throws in non-test env when ENCRYPTION_MASTER_KEY is short', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', ENCRYPTION_MASTER_KEY: 'deadbeef' })
    ).toThrow(/64-hex-character/);
  });

  it('throws in non-test env when ENCRYPTION_MASTER_KEY is overlength', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', ENCRYPTION_MASTER_KEY: 'ab'.repeat(40) })
    ).toThrow(/64-hex-character/);
  });

  it('accepts exact 64-hex ENCRYPTION_MASTER_KEY in non-test env', () => {
    const key = 'cd'.repeat(32);
    const config = loadConfig({ NODE_ENV: 'production', ENCRYPTION_MASTER_KEY: key });
    expect(config.encryptionMasterKey).toBe(key);
  });

  it('defaults ipAllowlistStrictMode to true (fail-closed) when env var not set', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.ipAllowlistStrictMode).toBe(true);
  });

  it('keeps ipAllowlistStrictMode=true when IP_ALLOWLIST_STRICT_MODE=true', () => {
    const config = loadConfig({ NODE_ENV: 'test', IP_ALLOWLIST_STRICT_MODE: 'true' });
    expect(config.ipAllowlistStrictMode).toBe(true);
  });

  it('disables ipAllowlistStrictMode only when IP_ALLOWLIST_STRICT_MODE=false', () => {
    const config = loadConfig({ NODE_ENV: 'test', IP_ALLOWLIST_STRICT_MODE: 'false' });
    expect(config.ipAllowlistStrictMode).toBe(false);
  });
});
