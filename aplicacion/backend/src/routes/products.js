import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { authRequired, requireRole } from '../middleware/auth.js';
import { initializeStore, store } from '../store.js';
import { computeFileHash } from '../utils/security.js';
import { injectFingerprint, writePersonalizedCopy } from '../utils/fingerprinting.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const productsDir = path.join(projectRoot, 'productos');

// Obtener catálogo de libros con filtros opcionales de búsqueda y género
router.get('/', async (req, res) => {
  await initializeStore();
  const { q, genre } = req.query;

  let books = store.products.filter((p) => p.status === 'ACTIVE');

  if (genre && genre !== 'TODOS') {
    books = books.filter((b) => b.genre && b.genre.toLowerCase() === String(genre).toLowerCase());
  }

  if (q) {
    const term = String(q).toLowerCase();
    books = books.filter((b) =>
      (b.title && b.title.toLowerCase().includes(term)) ||
      (b.name && b.name.toLowerCase().includes(term)) ||
      (b.author && b.author.toLowerCase().includes(term)) ||
      (b.synopsis && b.synopsis.toLowerCase().includes(term)) ||
      (b.isbn && b.isbn.toLowerCase().includes(term))
    );
  }

  res.json({
    library: 'BOOKONE - Biblioteca Digital',
    count: books.length,
    products: books,
    books: books, // Alias semántico
  });
});

// Lectura de muestra o contenido en el folio digital
router.get('/:id/read', async (req, res) => {
  await initializeStore();
  const book = store.products.find((item) => item.id === req.params.id);

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
    file_hash: book.file_hash,
    sample: content.slice(0, 4000),
    fullAvailable: true,
  });
});

// Detalle individual de una obra
router.get('/:id', async (req, res) => {
  await initializeStore();
  const product = store.products.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  return res.json({ product, book: product });
});

// Incorporación de nueva obra por Bibliotecario Mayor u Operador
router.post('/', authRequired, requireRole('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  await initializeStore();
  const { name, title, author, genre, isbn, description, synopsis, price, file_name, pages, publication_year, cover_accent } = req.body;

  const bookTitle = title || name;
  if (!bookTitle || price === undefined || !file_name) {
    return res.status(400).json({ error: 'Título de la obra, precio y nombre del archivo físico son obligatorios.' });
  }

  const filePath = path.join(productsDir, file_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo físico no encontrado en el directorio /productos de la biblioteca.' });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = await computeFileHash(fileBuffer);
  const textContent = fileBuffer.toString('utf8');

  const newBook = {
    id: `book-${randomUUID()}`,
    title: bookTitle,
    name: bookTitle,
    author: author || 'Autor Clásico',
    genre: genre || 'Colección General',
    isbn: isbn || `978-BOOK-${Date.now().toString().slice(-6)}`,
    synopsis: synopsis || description || 'Obra incorporada al acervo digital de BOOKONE.',
    description: synopsis || description || 'Obra incorporada al acervo digital de BOOKONE.',
    price: Number(price),
    pages: Number(pages) || 150,
    publication_year: Number(publication_year) || new Date().getFullYear(),
    cover_accent: cover_accent || '#824D28',
    file_name,
    file_hash: fileHash,
    excerpt: textContent.slice(0, 1500),
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  store.products.push(newBook);
  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'BOOK_CATALOGED',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_ARCHIVE',
  });

  return res.status(201).json({ product: newBook, book: newBook });
});

// Modificación de datos de una obra
router.patch('/:id', authRequired, requireRole('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  await initializeStore();
  const product = store.products.find((item) => item.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Obra no encontrada en el catálogo.' });
  }

  const { name, title, author, genre, synopsis, description, price, status, pages, cover_accent } = req.body;
  if (name || title) {
    product.name = title || name;
    product.title = title || name;
  }
  if (author) product.author = author;
  if (genre) product.genre = genre;
  if (synopsis !== undefined) product.synopsis = synopsis;
  if (description !== undefined) product.description = description;
  if (price !== undefined) product.price = Number(price);
  if (status) product.status = status;
  if (pages !== undefined) product.pages = Number(pages);
  if (cover_accent) product.cover_accent = cover_accent;

  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'BOOK_METADATA_UPDATED',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_ARCHIVE',
  });

  return res.json({ product, book: product });
});

// Descarga segura con verificación SHA-512 y estampado de Ex Libris Criptográfico
router.get('/:id/download', authRequired, async (req, res) => {
  await initializeStore();
  const product = store.products.find((item) => item.id === req.params.id);
  if (!product || product.status !== 'ACTIVE') {
    return res.status(404).json({ error: 'El libro solicitado no está disponible en este momento.' });
  }

  // Verificar que el usuario tenga un préstamo o adquisición aprobada de esta obra
  const order = store.orders.find(
    (item) => item.user_id === req.user.id && item.items.some((entry) => entry.product_id === product.id)
  );

  // Si es un administrador o curador, se le permite acceso directo para auditoría de preservación
  const hasAccess = order || ['ADMINISTRADOR', 'OPERADOR'].includes(req.user.role);
  if (!hasAccess) {
    return res.status(403).json({
      error: 'No cuenta con una adquisición o préstamo registrado para esta obra. Solicítela primero en el catálogo.',
    });
  }

  const orderId = order ? order.id : `AUDIT-${Date.now()}`;
  const filePath = path.join(productsDir, product.file_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'El archivo físico del libro no se localizó en el servidor.' });
  }

  const original = fs.readFileSync(filePath);
  const originalHash = await computeFileHash(original);

  if (originalHash !== product.file_hash) {
    store.securityEvents.push({
      id: randomUUID(),
      user_id: req.user.id,
      event: 'INTEGRITY_BREACH_DETECTED',
      created_at: new Date().toISOString(),
      result: 'FAILURE',
      origin: 'SHA512_VERIFIER',
    });
    return res.status(500).json({ error: 'Fallo crítico de integridad: el hash SHA-512 del libro no coincide.' });
  }

  // Estampar Ex Libris criptográfico con huella digital personalizada
  const withFingerprint = injectFingerprint(original, req.user.id, orderId, product.id, {
    userName: req.user.name,
    title: product.title || product.name,
  });

  const outputPath = writePersonalizedCopy(product, req.user.id, orderId, withFingerprint);

  store.downloads.push({
    id: `${orderId}-${product.id}`,
    user_id: req.user.id,
    order_id: orderId,
    product_id: product.id,
    file_path: outputPath,
    fingerprint: `user=${req.user.id};order=${orderId};product=${product.id}`,
    created_at: new Date().toISOString(),
  });

  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'DOWNLOAD',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_VAULT',
  });

  store.securityEvents.push({
    id: randomUUID(),
    user_id: req.user.id,
    event: 'FINGERPRINT_CREATED',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_VAULT',
  });

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="BOOKONE-${(product.title || product.name).replace(/\s+/g, '_')}.txt"`
  );
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(withFingerprint);
});

export default router;
