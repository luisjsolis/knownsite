// Ed25519 keys and signatures over RFC 8785 (JCS) canonical JSON. SPEC.md §4, §5.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** RFC 8785 canonical JSON. JS number serialization already matches the RFC. */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** Returns { privateKey: base64url PKCS#8 DER, publicKey: base64url raw 32-byte key }. */
export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
    publicKey: publicKey.export({ format: 'jwk' }).x,
  };
}

function importPrivate(b64) {
  return createPrivateKey({ key: Buffer.from(b64.trim(), 'base64url'), format: 'der', type: 'pkcs8' });
}

function importPublic(x) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

export function publicKeyFor(privateKeyB64) {
  return createPublicKey(importPrivate(privateKeyB64)).export({ format: 'jwk' }).x;
}

/** Adds `kid` and `sig`. The signature covers the canonical object including kid, excluding sig. */
export function signObject(obj, privateKeyB64, kid) {
  const { sig: _drop, ...rest } = obj;
  const body = { ...rest, kid };
  const sig = sign(null, Buffer.from(canonicalize(body)), importPrivate(privateKeyB64)).toString('base64url');
  return { ...body, sig };
}

export function verifyObject(obj, publicKeyX) {
  if (!obj || typeof obj.sig !== 'string') return false;
  const { sig, ...body } = obj;
  try {
    return verify(null, Buffer.from(canonicalize(body)), importPublic(publicKeyX), Buffer.from(sig, 'base64url'));
  } catch {
    return false;
  }
}

/** Private key from KNOWNSITE_PRIVATE_KEY, else .knownsite/private.key. Null means unsigned (Level 1). */
export async function loadPrivateKey(cwd) {
  if (process.env.KNOWNSITE_PRIVATE_KEY) return process.env.KNOWNSITE_PRIVATE_KEY.trim();
  try {
    return (await readFile(path.join(cwd, '.knownsite', 'private.key'), 'utf8')).trim();
  } catch {
    return null;
  }
}
