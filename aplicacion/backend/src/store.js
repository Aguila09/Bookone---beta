import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeFileHash, hashPassword } from './utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const productsDir = path.join(projectRoot, 'productos');

export const store = {
  users: [],
  products: [],
  orders: [],
  payments: [],
  downloads: [],
  securityEvents: [],
};

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
  },
];

export async function initializeStore() {
  if (store.users.length > 0) {
    return;
  }

  const adminHash = await hashPassword('admin123');
  const operatorHash = await hashPassword('operador123');
  const customerHash = await hashPassword('cliente123');

  // Lectores y personal de la Biblioteca Digital BOOKONE
  store.users.push(
    {
      id: 'admin-1',
      email: 'admin@bookone.org',
      aliases: ['admin@plataforma.test'],
      password_hash: adminHash,
      name: 'Bibliotecario Mayor (Administrador)',
      role: 'ADMINISTRADOR',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      last_login: null,
    },
    {
      id: 'operator-1',
      email: 'curador@bookone.org',
      aliases: ['operador@plataforma.test', 'operador@bookone.org'],
      password_hash: operatorHash,
      name: 'Curador de Archivo y Catálogo',
      role: 'OPERADOR',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      last_login: null,
    },
    {
      id: 'client-1',
      email: 'lector@bookone.org',
      aliases: ['cliente@plataforma.test', 'cliente@bookone.org'],
      password_hash: customerHash,
      name: 'Lector Registrado (Cliente)',
      role: 'CLIENTE',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      last_login: null,
    },
  );

  // Registro de Libros Digitales
  let index = 1;
  for (const bookInfo of INITIAL_BOOKS) {
    const filePath = path.join(productsDir, bookInfo.fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath);
    const fileHash = await computeFileHash(content);

    // Obtener un extracto inicial (primeras líneas) para previsualización directa
    const textSample = content.toString('utf8');
    const excerpt = textSample.slice(0, 1500);

    store.products.push({
      id: `book-${index}`,
      title: bookInfo.title,
      name: bookInfo.title, // Compatibilidad con el modelo de productos
      author: bookInfo.author,
      genre: bookInfo.genre,
      isbn: bookInfo.isbn,
      synopsis: bookInfo.synopsis,
      description: bookInfo.synopsis, // Compatibilidad con campo description
      price: bookInfo.price,
      pages: bookInfo.pages,
      publication_year: bookInfo.publication_year,
      cover_accent: bookInfo.cover_accent,
      file_name: bookInfo.fileName,
      file_hash: fileHash,
      excerpt: excerpt,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });

    index++;
  }

  store.securityEvents.push({
    id: 'evt-init-bookone',
    user_id: 'admin-1',
    event: 'LIBRARY_INITIALIZED',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_CORE',
  });
}
