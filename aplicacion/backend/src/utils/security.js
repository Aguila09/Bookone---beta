import argon2 from 'argon2';
import crypto from 'node:crypto';

export async function hashPassword(password) {
  return argon2.hash(password);
}

export async function verifyPassword(password, hash) {
  return argon2.verify(hash, password);
}

export async function computeFileHash(buffer) {
  return crypto.createHash('sha512').update(buffer).digest('hex');
}

export function buildInvoicePayload({ orderNumber, userId, total, items }) {
  return {
    orderNumber,
    userId,
    total,
    items,
    issuedAt: new Date().toISOString(),
    currency: 'USD',
  };
}

export async function signInvoice(payload, privateKey) {
  const message = Buffer.from(JSON.stringify(payload));
  const signatureBytes = await crypto.subtle.sign('Ed25519', privateKey, message);

  return {
    payload,
    signature: Buffer.from(signatureBytes).toString('base64'),
  };
}

export async function verifySignature(payload, signatureBase64, publicKey) {
  try {
    const message = Buffer.from(JSON.stringify(payload));
    const signature = Buffer.from(signatureBase64, 'base64');
    return await crypto.subtle.verify('Ed25519', publicKey, signature, message);
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
