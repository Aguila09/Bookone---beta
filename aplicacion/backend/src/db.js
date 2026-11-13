import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
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
  if (!activePool) {
    return null;
  }

  return activePool.query(sql, params);
}
