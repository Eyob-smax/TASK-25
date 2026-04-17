import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;   // 256-bit key
const NONCE_LEN = 12; // 96-bit nonce (GCM standard)
const TAG_LEN = 16;   // 128-bit authentication tag

/**
 * Derive a 256-bit subkey for a specific version number from the master key.
 * Uses HKDF-SHA256 so each key version is cryptographically independent.
 */
export function deriveKeyForVersion(masterKey: Buffer, version: number): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from(`greencycle-v${version}`), // salt
      'greencycle-field-encryption',          // info
      KEY_LEN,
    ),
  );
}

export interface EncryptedFieldData {
  version: number;
  nonce: string;      // hex-encoded 12 bytes
  tag: string;        // hex-encoded 16 bytes
  ciphertext: string; // hex-encoded arbitrary length
}

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM.
 */
export function encryptField(
  plaintext: string,
  keyMaterial: Buffer,
  version: number,
): EncryptedFieldData {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGORITHM, keyMaterial, nonce, { authTagLength: TAG_LEN });
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  return {
    version,
    nonce: nonce.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/**
 * Decrypt an EncryptedFieldData value. Throws if GCM authentication fails.
 */
export function decryptField(field: EncryptedFieldData, keyMaterial: Buffer): string {
  const nonce = Buffer.from(field.nonce, 'hex');
  const tag = Buffer.from(field.tag, 'hex');
  const ciphertext = Buffer.from(field.ciphertext, 'hex');
  const decipher = createDecipheriv(ALGORITHM, keyMaterial, nonce, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Serialize an EncryptedFieldData to a single storage string.
 * Format: `{version}:{nonceHex}:{tagHex}:{ciphertextHex}`
 */
export function serializeEncryptedField(field: EncryptedFieldData): string {
  return `${field.version}:${field.nonce}:${field.tag}:${field.ciphertext}`;
}

/**
 * Parse a storage string back into EncryptedFieldData.
 * The first three colons delimit version, nonce, tag; the rest is ciphertext.
 */
export function parseEncryptedField(stored: string): EncryptedFieldData {
  // Split on exactly the first 3 colons; ciphertext may contain none
  let remaining = stored;
  const consume = (): string => {
    const idx = remaining.indexOf(':');
    if (idx === -1) throw new Error('Invalid encrypted field format');
    const part = remaining.slice(0, idx);
    remaining = remaining.slice(idx + 1);
    return part;
  };

  const versionStr = consume();
  const nonce = consume();
  const tag = consume();
  const ciphertext = remaining;

  const version = parseInt(versionStr, 10);
  if (isNaN(version) || !nonce || !tag || !ciphertext) {
    throw new Error('Invalid encrypted field format');
  }
  return { version, nonce, tag, ciphertext };
}

/**
 * Encrypt a plaintext string using a master key + version, returning storage string.
 */
export function encryptFieldString(
  plaintext: string,
  masterKey: Buffer,
  version: number,
): string {
  const key = deriveKeyForVersion(masterKey, version);
  return serializeEncryptedField(encryptField(plaintext, key, version));
}

/**
 * Decrypt a storage string using the master key (version is embedded in string).
 */
export function decryptFieldString(stored: string, masterKey: Buffer): string {
  const field = parseEncryptedField(stored);
  const key = deriveKeyForVersion(masterKey, field.version);
  return decryptField(field, key);
}

/**
 * Parse a hex master key from config into a 32-byte Buffer.
 * Throws when the input is missing, too short, or contains non-hex characters —
 * there is no silent fallback, so a missing `ENCRYPTION_MASTER_KEY` cannot
 * degrade encryption to a predictable all-zero key.
 */
export function parseMasterKey(hexKey: string): Buffer {
  if (!hexKey || hexKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexKey)) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Derive a deterministic, keyed hash of a plaintext identifier so a unique
 * index can enforce uniqueness without the database ever seeing the plaintext.
 *
 * Uses HKDF-SHA256 of the master key into a dedicated "lookup-hash" subkey,
 * then HMAC-SHA256 of that subkey over the normalized plaintext. This keeps
 * the lookup key fully separated from the encryption key, so an attacker
 * with only ciphertext cannot invert or brute-force the plaintext without
 * the master key, while a legitimate service can compute the same hash for
 * any plaintext input to look it up in O(1).
 *
 * The plaintext is trimmed (leading/trailing whitespace) before hashing so
 * uniqueness is not bypassed by a trailing space.
 */
export function deriveLookupHash(plaintext: string, masterKey: Buffer): string {
  const subKey = Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('greencycle-lookup-hash'), // salt
      'greencycle-deterministic-lookup',     // info
      KEY_LEN,
    ),
  );
  return createHmac('sha256', subKey).update(plaintext.trim(), 'utf8').digest('hex');
}

// Binary layout for encrypted file buffers:
// [version(4 BE)][nonce(12)][tag(16)][ciphertext(N)]
const VERSION_OFFSET = 0;
const NONCE_OFFSET = 4;
const TAG_OFFSET = NONCE_OFFSET + NONCE_LEN;      // 16
const CIPHERTEXT_OFFSET = TAG_OFFSET + TAG_LEN;   // 32
const HEADER_SIZE = CIPHERTEXT_OFFSET;             // 32 bytes

/**
 * Encrypt an arbitrary Buffer (e.g. a SQLite database file) with AES-256-GCM.
 * The key version is embedded in the first 4 bytes of the output.
 */
export function encryptBuffer(data: Buffer, masterKey: Buffer, version: number): Buffer {
  const key = deriveKeyForVersion(masterKey, version);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_LEN });
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(version, VERSION_OFFSET);
  return Buffer.concat([header, nonce, tag, ciphertext]);
}

/**
 * Decrypt a Buffer produced by encryptBuffer.
 * Reads the key version from the header and derives the matching subkey.
 * Throws if GCM authentication fails (tampered ciphertext).
 */
export function decryptBuffer(data: Buffer, masterKey: Buffer): Buffer {
  if (data.length < HEADER_SIZE) throw new Error('Encrypted data too short');
  const version = data.readUInt32BE(VERSION_OFFSET);
  const nonce = data.subarray(NONCE_OFFSET, TAG_OFFSET);
  const tag = data.subarray(TAG_OFFSET, CIPHERTEXT_OFFSET);
  const ciphertext = data.subarray(CIPHERTEXT_OFFSET);
  const key = deriveKeyForVersion(masterKey, version);
  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
