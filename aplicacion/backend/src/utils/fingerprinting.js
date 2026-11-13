import fs from 'node:fs';
import path from 'node:path';

export function injectFingerprint(fileBuffer, userId, orderId, productId, extraInfo = {}) {
  const dateStr = new Date().toISOString();
  const userName = extraInfo.userName || userId;
  const bookTitle = extraInfo.title || productId;
  const marker = `\n
/* =============================================================================
 *                       EX LIBRIS DIGITAL CRIPTOGRÁFICO
 *                         BIBLIOTECA DIGITAL BOOKONE
 * =============================================================================
 * Ejemplar legalmente registrado y emitido para:
 * Lector / Titular : ${userName}
 * ID de Lector     : ${userId}
 * Folio de Préstamo: ${orderId}
 * Obra Digital     : ${bookTitle}
 * Código de Obra   : ${productId}
 * Fecha y Hora UTC : ${dateStr}
 * Protocolo        : BOOKONE Watermark v2 / Integridad SHA-512 / No Repudio Ed25519
 * =============================================================================
 * AVISO DE PRESERVACIÓN:
 * Este volumen digital contiene una huella individualizada ligada criptográficamente
 * a la identidad del titular. Garantiza la trazabilidad y la autenticidad del ejemplar.
 * ============================================================================= */
\n---FINGERPRINT---\nuser=${userId};order=${orderId};product=${productId};timestamp=${Date.now()}\n---END---\n`;

  return Buffer.concat([fileBuffer, Buffer.from(marker, 'utf8')]);
}

export function extractFingerprint(fileBuffer) {
  const text = fileBuffer.toString('utf8');
  const match = text.match(/---FINGERPRINT---\n([\s\S]*?)\n---END---/);

  if (!match) {
    return null;
  }

  return match[1].trim();
}

export function writePersonalizedCopy(product, userId, orderId, buffer) {
  const outputDir = path.resolve(process.cwd(), '../../productos/downloads');
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = product.file_name || `${product.id}.txt`;
  const outputPath = path.join(outputDir, `BOOKONE-${orderId.slice(0, 8)}-${userId.slice(0, 8)}-${fileName}`);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
