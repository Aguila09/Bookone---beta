import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { computeFileHash, hashPassword } from './utils/security.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const productsDir = path.join(projectRoot, 'productos');

let pool = null;
let initialized = false;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está definida en .env. PostgreSQL es obligatorio.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

export async function query(sql, params = []) {
  const activePool = getPool();
  return activePool.query(sql, params);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function logSecurityEvent(userId, event, result, origin = 'BOOKONE_CORE', client = null) {
  const safeUserId = isValidUUID(userId) ? userId : null;
  const executor = client || getPool();
  await executor.query(
    `INSERT INTO security_events (id, user_id, event, created_at, result, origin)
     VALUES ($1, $2, $3, NOW(), $4, $5)`,
    [randomUUID(), safeUserId, event, result, origin]
  );
}

const INITIAL_BOOKS = [
  {
    fileName: 'el-arte-de-la-guerra-sun-tzu.txt',
    title: 'El Arte de la Guerra',
    author: 'Sun Tzu',
    genre: 'Estrategia & Filosofía',
    isbn: '978-0-14-044919-8',
    synopsis: 'Tratado milenario sobre estrategia, diplomacia, resolución de conflictos y liderazgo más influyente de la historia universal.',
    price: 12.50,
    pages: 120,
    publication_year: -500,
    cover_accent: '#8B2635',
    cover_image: '/covers/el-arte-de-la-guerra-sun-tzu.jpg',
  },
  {
    fileName: 'tratado-criptografia-y-secreto-digital.txt',
    title: 'Tratado de Criptografía y Secreto Digital',
    author: 'Claude Shannon & Alan Turing',
    genre: 'Criptografía & Computación',
    isbn: '978-0-262-03384-8',
    synopsis: 'Fundamentos matemáticos del secreto perfecto, entropía de canales, hashing SHA-512 y firmas sobre curvas elípticas Ed25519.',
    price: 18.00,
    pages: 310,
    publication_year: 2024,
    cover_accent: '#1E3F30',
    cover_image: '/covers/tratado-criptografia-y-secreto-digital.webp',
  },
  {
    fileName: 'don-quijote-de-la-mancha-cervantes.txt',
    title: 'Don Quijote de la Mancha',
    author: 'Miguel de Cervantes Saavedra',
    genre: 'Literatura Clásica',
    isbn: '978-84-241-1628-6',
    synopsis: 'La obra cumbre de las letras hispanas: las andanzas del ingenioso hidalgo don Quijote y su leal escudero Sancho Panza.',
    price: 15.00,
    pages: 860,
    publication_year: 1605,
    cover_accent: '#824D28',
    cover_image: '/covers/don-quijote-de-la-mancha-cervantes.jpg',
  },
  {
    fileName: 'meditaciones-marco-aurelio.txt',
    title: 'Meditaciones',
    author: 'Marco Aurelio Antonino',
    genre: 'Filosofía Estoica',
    isbn: '978-0-14-044933-4',
    synopsis: 'Reflexiones íntimas del emperador filósofo sobre la serenidad, la fortaleza ética y el dominio del propio destino.',
    price: 14.00,
    pages: 215,
    publication_year: 180,
    cover_accent: '#C59B27',
    cover_image: '/covers/meditaciones-marco-aurelio.jpg',
  },
  {
    fileName: 'la-metamorfosis-franz-kafka.txt',
    title: 'La Metamorfosis',
    author: 'Franz Kafka',
    genre: 'Ficción & Vanguardia',
    isbn: '978-0-486-29041-6',
    synopsis: 'La lúcida y conmovedora parábola de Gregorio Samsa y su inesperada transformación al despertar una mañana.',
    price: 11.50,
    pages: 140,
    publication_year: 1915,
    cover_accent: '#2B3A42',
    cover_image: '/covers/la-metamorfosis-franz-kafka.jpg',
  },
  {
    fileName: 'principios-seguridad-informacion-ramos.txt',
    title: 'Principios de Seguridad en Repositorios Digitales',
    author: 'Víctor Ramos & Cátedra de Ciberseguridad',
    genre: 'Seguridad de la Información',
    isbn: '978-607-00-1122-3',
    synopsis: 'Defensa en profundidad, TLS 1.3, hashing SHA-512, derivación Argon2id, fingerprinting individualizado y no repudio.',
    price: 22.00,
    pages: 275,
    publication_year: 2026,
    cover_accent: '#5E2129',
    cover_image: '/covers/principios-seguridad-informacion-ramos.webp',
  },
  {
    fileName: 'curso-criptografia.txt',
    title: 'Curso Práctico de Criptografía Aplicada',
    author: 'Archivo de Seguridad BOOKONE',
    genre: 'Criptografía & Computación',
    isbn: '978-0-11-223344-5',
    synopsis: 'Guía práctica sobre confidencialidad, integridad, no repudio y algoritmos modernos de cifrado.',
    price: 19.99,
    pages: 95,
    publication_year: 2025,
    cover_accent: '#1E3F30',
    cover_image: '/covers/curso-criptografia.webp',
  },
  {
    fileName: 'guia-seguridad.txt',
    title: 'Guía de Seguridad para Repositorios y Bibliotecas',
    author: 'Comité de Seguridad de la Información',
    genre: 'Seguridad de la Información',
    isbn: '978-0-11-998877-1',
    synopsis: 'Normas y protocolos para la gestión de identidades, resguardo de acervos y verificación de certificados HTTPS.',
    price: 24.99,
    pages: 80,
    publication_year: 2025,
    cover_accent: '#8B2635',
    cover_image: '/covers/guia-seguridad.webp',
  },
  {
    fileName: 'manual-basico.txt',
    title: 'Manual Básico de Preservación Digital',
    author: 'Equipo Técnico BOOKONE',
    genre: 'Preservación Digital',
    isbn: '978-0-11-445566-2',
    synopsis: 'Procedimientos fundamentales para la firma digital de ejemplares y control de descargas mediante sellado criptográfico.',
    price: 29.99,
    pages: 70,
    publication_year: 2025,
    cover_accent: '#824D28',
    cover_image: '/covers/manual-basico.webp',
  },
];

export async function initializeDatabase() {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'CLIENTE',
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      token_version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

    CREATE TABLE IF NOT EXISTS used_reset_tokens (
      jti UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
      file_name VARCHAR(255) NOT NULL,
      file_hash VARCHAR(128) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products ADD COLUMN IF NOT EXISTS title VARCHAR(255);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS author VARCHAR(255) NOT NULL DEFAULT 'Autor Clásico';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS genre VARCHAR(100) NOT NULL DEFAULT 'Literatura General';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS isbn VARCHAR(30);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS synopsis TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS pages INT DEFAULT 180;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS publication_year INT DEFAULT 2026;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_accent VARCHAR(50) DEFAULT '#824D28';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_image VARCHAR(255) DEFAULT '';

    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      total NUMERIC(12,2) NOT NULL,
      status VARCHAR(50) NOT NULL,
      loan_type VARCHAR(50) NOT NULL DEFAULT 'ADQUISICION',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS loan_type VARCHAR(50) NOT NULL DEFAULT 'ADQUISICION';

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_payload JSONB;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_signature TEXT;

    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name VARCHAR(255) NOT NULL DEFAULT 'Lector BOOKONE';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100) NOT NULL DEFAULT 'SIMULADO_TARJETA_PRUEBA';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS simulated_last4 VARCHAR(4) NOT NULL DEFAULT '0000';

    CREATE TABLE IF NOT EXISTS order_items (
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      price NUMERIC(12,2) NOT NULL,
      PRIMARY KEY (order_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      transaction_reference VARCHAR(255) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      status VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      order_id UUID REFERENCES orders(id),
      product_id UUID NOT NULL REFERENCES products(id),
      fingerprint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE downloads ALTER COLUMN order_id DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS security_events (
      id UUID PRIMARY KEY,
      user_id UUID,
      event VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      result VARCHAR(50) NOT NULL,
      origin VARCHAR(100) NOT NULL
    );
  `);

  const usersCountRes = await query('SELECT COUNT(*)::int AS count FROM users');
  let adminId = null;

  if (usersCountRes.rows[0].count === 0) {
    adminId = randomUUID();
    const adminHash = await hashPassword('admin123');
    const operatorHash = await hashPassword('operador123');
    const customerHash = await hashPassword('cliente123');

    await query(
      `INSERT INTO users (id, email, password_hash, name, role, status, token_version, created_at)
       VALUES
         ($1, 'admin@bookone.org', $2, 'Bibliotecario Mayor (Administrador)', 'ADMINISTRADOR', 'ACTIVE', 1, NOW()),
         ($3, 'curador@bookone.org', $4, 'Curador de Archivo y Catálogo', 'OPERADOR', 'ACTIVE', 1, NOW()),
         ($5, 'lector@bookone.org', $6, 'Lector Registrado (Cliente)', 'CLIENTE', 'ACTIVE', 1, NOW())`,
      [adminId, adminHash, randomUUID(), operatorHash, randomUUID(), customerHash]
    );
  } else {
    const adminRes = await query("SELECT id FROM users WHERE role = 'ADMINISTRADOR' LIMIT 1");
    adminId = adminRes.rows[0]?.id || null;
  }

  const productsCountRes = await query('SELECT COUNT(*)::int AS count FROM products');
  if (productsCountRes.rows[0].count === 0) {
    for (const bookInfo of INITIAL_BOOKS) {
      const filePath = path.join(productsDir, bookInfo.fileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath);
      const fileHash = await computeFileHash(content);

      await query(
        `INSERT INTO products (
           id, name, title, author, genre, isbn, synopsis, description,
           price, pages, publication_year, cover_accent, cover_image,
           file_name, file_hash, status, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, $15, 'ACTIVE', NOW()
         )`,
        [
          randomUUID(),
          bookInfo.title,
          bookInfo.title,
          bookInfo.author,
          bookInfo.genre,
          bookInfo.isbn,
          bookInfo.synopsis,
          bookInfo.synopsis,
          bookInfo.price,
          bookInfo.pages,
          bookInfo.publication_year,
          bookInfo.cover_accent,
          bookInfo.cover_image,
          bookInfo.fileName,
          fileHash,
        ]
      );
    }

    await logSecurityEvent(adminId, 'LIBRARY_INITIALIZED', 'SUCCESS', 'BOOKONE_POSTGRES');
  }

  initialized = true;
}