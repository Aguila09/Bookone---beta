import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { initializeDatabase, isValidUUID, logSecurityEvent, query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { computeFileHash } from '../utils/security.js';
import { injectFingerprint, writePersonalizedCopy } from '../utils/fingerprinting.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../..');
const productsDir = path.join(projectRoot, 'productos');

function formatBookRow(row) {
  return {
    ...row,
    title: row.title || row.name,
    synopsis: row.synopsis || row.description,
    price: Number(row.price),
  };
}

// Consulta pública de catálogo
router.get('/', async (req, res) => {
  await initializeDatabase();
  const { q, genre } = req.query;

  const conditions = ["status = 'ACTIVE'"];
  const params = [];

  if (genre && genre !== 'TODOS') {
    params.push(String(genre).trim());
    conditions.push(`LOWER(genre) = LOWER($${params.length})`);
  }

  if (q) {
    params.push(`%${String(q).trim()}%`);
    const idx = params.length;
    conditions.push(
      `(COALESCE(title, name) ILIKE $${idx} OR author ILIKE $${idx} OR COALESCE(synopsis, description) ILIKE $${idx} OR COALESCE(isbn, '') ILIKE $${idx})`
    );
  }

  const sql = `SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC, name ASC`;
  const result = await query(sql, params);
  const books = result.rows.map(formatBookRow);

  res.json({
    library: 'BOOKONE - Biblioteca Digital',
    count: books.length,
    products: books,
    books,
  });
});

// Lectura de muestra en el folio digital
router.get('/:id/read', async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Libro no encontrado en el archivo de BOOKONE.' });
  }

  const result = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  const book = result.rows[0];

  if (!book) {
    return res.status(404).json({ error: 'Libro no encontrado en el archivo de BOOKONE.' });
  }

  const filePath = path.join(productsDir, book.file_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo físico del libro no se encuentra en el repositorio.' });
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return res.json({
    id: book.id,
    title: book.title || book.name,
    author: book.author,
    genre: book.genre,
    pages: book.pages,
    publication_year: book.publication_year,
    cover_image: book.cover_image || '',
    file_hash: book.file_hash,
    sample: content.slice(0, 4000),
    fullAvailable: true,
  });
});

// Consulta pública de información de un producto
router.get('/:id', async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  const result = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  const product = formatBookRow(result.rows[0]);
  return res.json({ product, book: product });
});

// Privilegio OPERADOR / ADMINISTRADOR: registrar producto
router.post('/', authRequired, requireRole('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  const {
    name,
    title,
    author,
    genre,
    isbn,
    description,
    synopsis,
    price,
    file_name,
    pages,
    publication_year,
    cover_accent,
    cover_image,
  } = req.body;

  const bookTitle = title || name;
  if (!bookTitle || price === undefined || !file_name) {
    return res.status(400).json({ error: 'Título de la obra, precio y nombre del archivo físico son obligatorios.' });
  }

  const safeFileName = path.basename(String(file_name));
  const filePath = path.join(productsDir, safeFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo físico no encontrado en el directorio /productos de la biblioteca.' });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = await computeFileHash(fileBuffer);
  const finalSynopsis = synopsis || description || 'Obra incorporada al acervo digital de BOOKONE.';
  const finalIsbn = isbn || `978-BOOK-${Date.now().toString().slice(-6)}`;

  const inserted = await query(
    `INSERT INTO products (
       id, name, title, author, genre, isbn, synopsis, description,
       price, pages, publication_year, cover_accent, cover_image,
       file_name, file_hash, status, created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, 'ACTIVE', NOW()
     ) RETURNING *`,
    [
      randomUUID(),
      bookTitle,
      bookTitle,
      author || 'Autor Clásico',
      genre || 'Colección General',
      finalIsbn,
      finalSynopsis,
      finalSynopsis,
      Number(price),
      Number(pages) || 150,
      Number(publication_year) || new Date().getFullYear(),
      cover_accent || '#824D28',
      cover_image ? String(cover_image).trim() : '',
      safeFileName,
      fileHash,
    ]
  );

  await logSecurityEvent(req.user.id, 'BOOK_CATALOGED', 'SUCCESS', 'BOOKONE_ARCHIVE');

  const newBook = formatBookRow(inserted.rows[0]);
  return res.status(201).json({ product: newBook, book: newBook });
});

// Privilegio OPERADOR / ADMINISTRADOR: modificar producto, precio o estado
router.patch('/:id', authRequired, requireRole('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  const {
    name,
    title,
    author,
    genre,
    synopsis,
    description,
    price,
    status,
    pages,
    cover_accent,
    cover_image,
  } = req.body;

  if (status && !['ACTIVE', 'DISABLED', 'ARCHIVED'].includes(status)) {
    return res.status(400).json({ error: 'Estado de producto no válido.' });
  }

  const newTitle = title || name || null;
  const newSynopsis = synopsis !== undefined ? synopsis : description !== undefined ? description : null;

  const updated = await query(
    `UPDATE products SET
       name = COALESCE($1, name),
       title = COALESCE($1, title),
       author = COALESCE($2, author),
       genre = COALESCE($3, genre),
       synopsis = COALESCE($4, synopsis),
       description = COALESCE($4, description),
       price = COALESCE($5, price),
       status = COALESCE($6, status),
       pages = COALESCE($7, pages),
       cover_accent = COALESCE($8, cover_accent),
       cover_image = COALESCE($9, cover_image)
     WHERE id = $10
     RETURNING *`,
    [
      newTitle,
      author || null,
      genre || null,
      newSynopsis,
      price !== undefined ? Number(price) : null,
      status || null,
      pages !== undefined ? Number(pages) : null,
      cover_accent || null,
      cover_image !== undefined ? String(cover_image).trim() : null,
      req.params.id,
    ]
  );

  if (updated.rows.length === 0) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  await logSecurityEvent(req.user.id, 'BOOK_METADATA_UPDATED', 'SUCCESS', 'BOOKONE_ARCHIVE');

  const product = formatBookRow(updated.rows[0]);
  return res.json({ product, book: product });
});

// Descarga segura verificando compra previa (Secciones 5.1, 8, 12, 16, 19)
router.get('/:id/download', authRequired, async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'El libro solicitado no está disponible en este momento.' });
  }

  const prodRes = await query("SELECT * FROM products WHERE id = $1 AND status = 'ACTIVE'", [req.params.id]);
  const product = prodRes.rows[0];

  if (!product) {
    return res.status(404).json({ error: 'El libro solicitado no está disponible en este momento.' });
  }

  const orderRes = await query(
    `SELECT o.id FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1 AND oi.product_id = $2
     ORDER BY o.created_at DESC LIMIT 1`,
    [req.user.id, product.id]
  );

  const order = orderRes.rows[0];
  const hasAccess = Boolean(order) || ['ADMINISTRADOR', 'OPERADOR'].includes(req.user.role);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'No cuenta con una adquisición o préstamo registrado para esta obra. Solicítela primero en el catálogo.',
    });
  }

  const orderIdForStamp = order ? order.id : `AUDIT-${Date.now()}`;
  const filePath = path.join(productsDir, product.file_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo físico del libro no se localizó en el servidor.' });
  }

  const original = fs.readFileSync(filePath);
  const originalHash = await computeFileHash(original);

  if (originalHash !== product.file_hash) {
    await logSecurityEvent(req.user.id, 'INTEGRITY_BREACH_DETECTED', 'FAILURE', 'SHA512_VERIFIER');
    return res.status(500).json({ error: 'Fallo crítico de integridad: el hash SHA-512 del libro no coincide.' });
  }

  const withFingerprint = injectFingerprint(original, req.user.id, orderIdForStamp, product.id, {
    userName: req.user.name,
    title: product.title || product.name,
  });

  writePersonalizedCopy(product, req.user.id, orderIdForStamp, withFingerprint);

  const fingerprintStr = `user=${req.user.id};order=${orderIdForStamp};product=${product.id}`;

  await query(
    `INSERT INTO downloads (id, user_id, order_id, product_id, fingerprint, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [randomUUID(), req.user.id, order ? order.id : null, product.id, fingerprintStr]
  );

  await logSecurityEvent(req.user.id, 'DOWNLOAD', 'SUCCESS', 'BOOKONE_VAULT');
  await logSecurityEvent(req.user.id, 'FINGERPRINT_CREATED', 'SUCCESS', 'BOOKONE_VAULT');

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="BOOKONE-${(product.title || product.name).replace(/\s+/g, '_')}.txt"`
  );
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(withFingerprint);
});

export default router;