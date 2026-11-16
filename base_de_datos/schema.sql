-- =============================================================================
-- ESQUEMA DE BASE DE DATOS: BOOKONE - BIBLIOTECA DIGITAL Y REPOSITORIO SEGURO
-- =============================================================================

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

CREATE TABLE IF NOT EXISTS used_reset_tokens (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  author VARCHAR(255) NOT NULL DEFAULT 'Autor Clásico',
  genre VARCHAR(100) NOT NULL DEFAULT 'Literatura General',
  isbn VARCHAR(30),
  synopsis TEXT,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  pages INT DEFAULT 180,
  publication_year INT DEFAULT 2026,
  cover_accent VARCHAR(50) DEFAULT '#824D28',
  cover_image VARCHAR(255) DEFAULT '',
  file_name VARCHAR(255) NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    cover_image,
    file_name,
    file_hash,
    status,
    created_at
  FROM products;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  total NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  loan_type VARCHAR(50) NOT NULL DEFAULT 'ADQUISICION',
  invoice_payload JSONB,
  invoice_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  payer_name VARCHAR(255) NOT NULL DEFAULT 'Lector BOOKONE',
  payment_method VARCHAR(100) NOT NULL DEFAULT 'SIMULADO_TARJETA_PRUEBA',
  simulated_last4 VARCHAR(4) NOT NULL DEFAULT '0000',
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

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  user_id UUID,
  event VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result VARCHAR(50) NOT NULL,
  origin VARCHAR(100) NOT NULL
);



CREATE INDEX IF NOT EXISTS idx_products_genre ON products(genre);
CREATE INDEX IF NOT EXISTS idx_products_author ON products(author);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);