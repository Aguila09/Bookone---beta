import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hashPassword,
  verifyPassword,
  computeFileHash,
  buildInvoicePayload,
  signInvoice,
  verifySignature,
} from '../src/utils/security.js';

test('Argon2id hash and verify should work', async () => {
  const hash = await hashPassword('Secret123!');
  assert.match(hash, /^\$argon2id\$/);
  const valid = await verifyPassword('Secret123!', hash);
  assert.equal(valid, true);
  const invalid = await verifyPassword('WrongPassword', hash);
  assert.equal(invalid, false);
});

test('SHA-512 should detect modified file', async () => {
  const original = Buffer.from('contenido original');
  const hashA = await computeFileHash(original);
  const hashB = await computeFileHash(Buffer.from('contenido modificado'));

  assert.equal(hashA.length, 128);
  assert.notEqual(hashA, hashB);
});

test('Invoice signing should be valid for original payload and invalid for tampered payload', async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,
    ['sign', 'verify'],
  );

  const payload = buildInvoicePayload({
    orderNumber: 'ORD-1001',
    userId: 'user-1',
    total: 100,
    items: ['Libro A'],
  });

  const signed = await signInvoice(payload, keys.privateKey);
  const valid = await verifySignature(payload, signed.signature, keys.publicKey);
  const tampered = { ...payload, total: 999 };
  const invalid = await verifySignature(tampered, signed.signature, keys.publicKey);

  assert.equal(valid, true);
  assert.equal(invalid, false);
});
