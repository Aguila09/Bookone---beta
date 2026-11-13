-- =============================================================================
-- ESQUEMA DE BASE DE DATOS: BOOKONE - BIBLIOTECA DIGITAL Y REPOSITORIO SEGURO
-- Proyecto de Seguridad de la Información II
-- =============================================================================

-- 1. Tabla de Usuarios y Lectores de la Biblioteca
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'CLIENTE', -- CLIENTE (Lector), OPERADOR (Curador), ADMINISTRADOR (Bibliotecario Mayor)
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DISABLED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 2. Catálogo de Libros y Obras Digitales (Compatible con tabla products)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,                 -- Título de la obra
  title VARCHAR(255),                         -- Alias explícito de título
  author VARCHAR(255) NOT NULL DEFAULT 'Autor Clásico', -- Autor / Creador
  genre VARCHAR(100) NOT NULL DEFAULT 'Literatura General', -- Género literario o científico
  isbn VARCHAR(30),                           -- Identificador normalizado / ISBN
  synopsis TEXT,                              -- Sinopsis completa de la obra
  description TEXT,                           -- Resumen editorial breve
  price NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- Cuota de acceso / adquisición
  pages INT DEFAULT 180,                      -- Extensión en páginas
  publication_year INT DEFAULT 2026,          -- Año de edición / publicación
  cover_accent VARCHAR(50) DEFAULT '#824D28', -- Tono editorial de la cubierta
  file_name VARCHAR(255) NOT NULL,            -- Nombre del archivo físico en repositorio
  file_hash VARCHAR(128) NOT NULL,            -- Resumen criptográfico SHA-512 del texto
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',-- ACTIVE, ARCHIVED, RESTRICTED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vista alias para consultas semánticas de biblioteca
CREATE OR REPLACE VIEW books AS 
  SELECT 
    id,
    COALESCE(title, name) AS title,
    name,
    author,
    genre,
    isbn,
    COALESCE(synopsis, description) AS synopsis,
    description,
    price,
    pages,
    publication_year,
    cover_accent,
    file_name,
    file_hash,
    status,
    created_at
  FROM products;

-- 3. Préstamos y Adquisiciones Digitales
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  total NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) NOT NULL,                -- APPROVED, PENDING, CANCELLED
  loan_type VARCHAR(50) NOT NULL DEFAULT 'ADQUISICION', -- ADQUISICION, PRESTAMO_TEMPORAL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Ítems de Préstamo / Obras Solicitadas
CREATE TABLE IF NOT EXISTS order_items (
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

-- 5. Registro de Transacciones y Comprobantes
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  transaction_reference VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Descargas Individualizadas con Huella Digital (Ex Libris Criptográfico)
CREATE TABLE IF NOT EXISTS downloads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Registro de Auditoría de Eventos de Seguridad
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  user_id UUID,
  event VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result VARCHAR(50) NOT NULL,
  origin VARCHAR(100) NOT NULL
);

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_products_genre ON products(genre);
CREATE INDEX IF NOT EXISTS idx_products_author ON products(author);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
