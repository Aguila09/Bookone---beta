#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import argon2 from 'argon2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, 'aplicacion/backend/.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const [, , actorEmail, command, ...args] = process.argv;

async function logEvent(userId, event, result) {
  await pool.query(
    `INSERT INTO security_events (id, user_id, event, created_at, result, origin)
     VALUES ($1, $2, $3, NOW(), $4, 'BOOKONE_SSH_CLI')`,
    [randomUUID(), userId, event, result]
  );
}

async function main() {
  if (!actorEmail || !command) {
    console.log(`
Uso por SSH:
  node scripts/admin_cli.js <correo_staff> <comando> [argumentos]

Comandos ADMINISTRADOR:
  users                                 Listar usuarios (sin password_hash)
  set-role <email> <ROL>                Cambiar rol (CLIENTE | OPERADOR | ADMINISTRADOR)
  set-status <email> <ESTADO>           Activar/desactivar cuenta (ACTIVE | DISABLED)
  revoke-sessions <email>               Revocar sesiones activas del usuario
  events [limite]                       Consultar bitácora security_events

Comandos OPERADOR / ADMINISTRADOR:
  orders                                Listar todas las órdenes y pagos simulados
  order-status <order_uuid> <ESTADO>    Actualizar estado de orden (APPROVED | COMPLETED | CANCELLED)
  set-price <product_uuid> <precio>     Actualizar precio de una obra
  product-status <product_uuid> <EST>   Activar/desactivar obra (ACTIVE | DISABLED)
`);
    process.exit(1);
  }

  const actorRes = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [actorEmail]);
  const actor = actorRes.rows[0];

  if (!actor || actor.status !== 'ACTIVE' || !['ADMINISTRADOR', 'OPERADOR'].includes(actor.role)) {
    console.error('Acceso denegado: el usuario no existe, está inactivo o no tiene rol de staff.');
    process.exit(1);
  }

  const requireAdmin = () => {
    if (actor.role !== 'ADMINISTRADOR') {
      console.error('Acceso denegado: este comando requiere rol ADMINISTRADOR.');
      process.exit(1);
    }
  };

  switch (command) {
    case 'users': {
      requireAdmin();
      const res = await pool.query(
        'SELECT id, email, name, role, status, token_version, last_login FROM users ORDER BY created_at ASC'
      );
      console.table(res.rows);
      break;
    }

    case 'set-role': {
      requireAdmin();
      const [targetEmail, newRole] = args;
      if (!['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'].includes(newRole)) {
        throw new Error('Rol inválido.');
      }
      const res = await pool.query(
        'UPDATE users SET role = $1, token_version = token_version + 1 WHERE LOWER(email) = LOWER($2) RETURNING email, role',
        [newRole, targetEmail]
      );
      if (res.rows.length === 0) throw new Error('Usuario destino no encontrado.');
      await logEvent(actor.id, 'ROLE_CHANGED', 'SUCCESS');
      console.log('Rol actualizado:', res.rows[0]);
      break;
    }

    case 'set-status': {
      requireAdmin();
      const [targetEmail, newStatus] = args;
      if (!['ACTIVE', 'DISABLED'].includes(newStatus)) {
        throw new Error('Estado inválido (ACTIVE o DISABLED).');
      }
      const res = await pool.query(
        `UPDATE users SET status = $1, token_version = token_version + 1
         WHERE LOWER(email) = LOWER($2) RETURNING email, status`,
        [newStatus, targetEmail]
      );
      if (res.rows.length === 0) throw new Error('Usuario destino no encontrado.');
      await logEvent(actor.id, newStatus === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED', 'SUCCESS');
      console.log('Estado actualizado:', res.rows[0]);
      break;
    }

    case 'revoke-sessions': {
      requireAdmin();
      const [targetEmail] = args;
      const res = await pool.query(
        'UPDATE users SET token_version = token_version + 1 WHERE LOWER(email) = LOWER($1) RETURNING email, token_version',
        [targetEmail]
      );
      if (res.rows.length === 0) throw new Error('Usuario destino no encontrado.');
      await logEvent(actor.id, 'SESSION_REVOKED', 'SUCCESS');
      console.log('Sesiones revocadas:', res.rows[0]);
      break;
    }

    case 'events': {
      requireAdmin();
      const limit = Number(args[0]) || 25;
      const res = await pool.query(
        'SELECT created_at, event, result, origin, user_id FROM security_events ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
      console.table(res.rows);
      break;
    }

    case 'orders': {
      const res = await pool.query(
        `SELECT o.id, u.email, o.total, o.status, p.transaction_reference, p.payer_name, p.payment_method, p.simulated_last4
         FROM orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN payments p ON p.order_id = o.id
         ORDER BY o.created_at DESC`
      );
      console.table(res.rows);
      break;
    }

    case 'order-status': {
      const [orderId, status] = args;
      const res = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING id, status', [status, orderId]);
      if (res.rows.length === 0) throw new Error('Orden no encontrada.');
      await logEvent(actor.id, 'ORDER_STATUS_UPDATED', 'SUCCESS');
      console.log('Orden actualizada:', res.rows[0]);
      break;
    }

    case 'set-price': {
      const [productId, price] = args;
      const res = await pool.query(
        'UPDATE products SET price = $1 WHERE id = $2 RETURNING id, name, price',
        [Number(price), productId]
      );
      if (res.rows.length === 0) throw new Error('Producto no encontrado.');
      await logEvent(actor.id, 'BOOK_METADATA_UPDATED', 'SUCCESS');
      console.log('Precio actualizado:', res.rows[0]);
      break;
    }

    case 'product-status': {
      const [productId, status] = args;
      const res = await pool.query(
        'UPDATE products SET status = $1 WHERE id = $2 RETURNING id, name, status',
        [status, productId]
      );
      if (res.rows.length === 0) throw new Error('Producto no encontrado.');
      await logEvent(actor.id, 'BOOK_METADATA_UPDATED', 'SUCCESS');
      console.log('Estado del producto actualizado:', res.rows[0]);
      break;
    }

    default:
      console.error(`Comando desconocido: ${command}`);
      process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());