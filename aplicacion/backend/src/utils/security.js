import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../..');

const DEFAULT_PRIVATE_KEY_PATH = path.join(projectRoot, 'claves_publicas', 'private_key.pem');
const DEFAULT_PUBLIC_KEY_PATH = path.join(projectRoot, 'claves_publicas', 'public_key.pem');

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password, hash) {
  return argon2.verify(hash, password);
}

export async function computeFileHash(buffer) {
  return crypto.createHash('sha512').update(buffer).digest('hex');
}

export function getExternalEd25519Keys() {
  const privPath = process.env.ED25519_PRIVATE_KEY_PATH
    ? path.resolve(process.env.ED25519_PRIVATE_KEY_PATH)
    : DEFAULT_PRIVATE_KEY_PATH;

  const pubPath = process.env.ED25519_PUBLIC_KEY_PATH
    ? path.resolve(process.env.ED25519_PUBLIC_KEY_PATH)
    : DEFAULT_PUBLIC_KEY_PATH;

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    throw new Error(
      'Faltan las llaves Ed25519 externas. Ejecuta primero: bash scripts/generate_ed25519_keys.sh'
    );
  }

  const privateKeyPem = fs.readFileSync(privPath, 'utf8');
  const publicKeyPem = fs.readFileSync(pubPath, 'utf8');

  return {
    privateKey: crypto.createPrivateKey(privateKeyPem),
    publicKey: crypto.createPublicKey(publicKeyPem),
    publicKeyPem,
  };
}

export function buildInvoicePayload({ orderNumber, userId, total, items, transactionReference }) {
  return {
    orderNumber,
    userId,
    total,
    items,
    transactionReference: transactionReference || `BOOKONE-FOLIO-${Date.now()}`,
    issuedAt: new Date().toISOString(),
    currency: 'USD',
  };
}

export async function signInvoice(payload, privateKey = null) {
  const message = Buffer.from(JSON.stringify(payload));
  const activePrivateKey = privateKey || getExternalEd25519Keys().privateKey;

  if (activePrivateKey instanceof crypto.KeyObject) {
    const signatureBytes = crypto.sign(null, message, activePrivateKey);
    return {
      payload,
      signature: signatureBytes.toString('base64'),
    };
  }

  const signatureBytes = await crypto.subtle.sign('Ed25519', activePrivateKey, message);
  return {
    payload,
    signature: Buffer.from(signatureBytes).toString('base64'),
  };
}

export async function verifySignature(payload, signatureBase64, publicKey = null) {
  try {
    const message = Buffer.from(JSON.stringify(payload));
    const signature = Buffer.from(signatureBase64, 'base64');
    const activePublicKey = publicKey || getExternalEd25519Keys().publicKey;

    if (typeof activePublicKey === 'string') {
      return crypto.verify(null, message, crypto.createPublicKey(activePublicKey), signature);
    }

    if (activePublicKey instanceof crypto.KeyObject) {
      return crypto.verify(null, message, activePublicKey, signature);
    }

    return await crypto.subtle.verify('Ed25519', activePublicKey, signature, message);
  } catch (error) {
    return false;
  }
}

export async function generateEd25519KeyPair() {
  return crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,
    ['sign', 'verify'],
  );
}