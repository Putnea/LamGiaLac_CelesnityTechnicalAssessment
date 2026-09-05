import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-CBC credential encryption utility.
 *
 * Credentials are encrypted at rest in the database.
 * They must NEVER be:
 *   - Returned by any API response
 *   - Written to logs
 *   - Committed to source control
 *
 * Key is derived from the ENCRYPTION_KEY env var using scrypt.
 * Stored format: <hex iv>:<hex encrypted>
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  // Use a fixed salt here (could be randomised per-record but adds complexity without
  // much benefit since the secret already provides entropy)
  const salt = Buffer.from('celesnity-laundry-platform', 'utf8');
  return scryptSync(secret, salt, KEY_LENGTH) as Buffer;
}

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Set it to a random 32+ character string before starting the service.'
    );
  }
  return secret;
}

export function encrypt(plaintext: string): string {
  const key = deriveKey(getSecret());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const [ivHex, encryptedHex] = stored.split(':');
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted credential format');
  }
  const key = deriveKey(getSecret());
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Safely encrypt an object (e.g. credential fields).
 * Returns null if the input is null/undefined.
 */
export function encryptObject(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  return encrypt(JSON.stringify(obj));
}

/**
 * Safely decrypt back to an object.
 * Returns null if stored is null/undefined.
 */
export function decryptObject<T>(stored: string | null): T | null {
  if (!stored) return null;
  return JSON.parse(decrypt(stored)) as T;
}
