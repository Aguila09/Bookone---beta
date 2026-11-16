import express from 'express';

import { initializeDatabase, isValidUUID, logSecurityEvent, query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Privilegio exclusivo ADMINISTRADOR: consultar usuarios (sin password_hash)
router.get('/users', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  const result = await query(
    'SELECT id, email, name, role, status, token_version, created_at, last_login FROM users ORDER BY created_at ASC'
  );
  return res.json({ users: result.rows });
});

// Resumen general del sistema (ADMINISTRADOR)
router.get('/stats', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();

  const [booksRes, activeBooksRes, usersRes, ordersRes, downloadsRes, eventsCountRes, lastEventsRes] =
    await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM products'),
      query("SELECT COUNT(*)::int AS count FROM products WHERE status = 'ACTIVE'"),
      query('SELECT COUNT(*)::int AS count FROM users'),
      query('SELECT COUNT(*)::int AS count FROM orders'),
      query('SELECT COUNT(*)::int AS count FROM downloads'),
      query('SELECT COUNT(*)::int AS count FROM security_events'),
      query('SELECT * FROM security_events ORDER BY created_at DESC LIMIT 10'),
    ]);

  return res.json({
    totalBooks: booksRes.rows[0].count,
    activeBooks: activeBooksRes.rows[0].count,
    totalUsers: usersRes.rows[0].count,
    totalOrders: ordersRes.rows[0].count,
    totalDownloads: downloadsRes.rows[0].count,
    totalEvents: eventsCountRes.rows[0].count,
    lastEvents: lastEventsRes.rows,
  });
});

// Privilegio exclusivo ADMINISTRADOR: activar o desactivar cuentas (Sección 5.3 y 16)
router.patch('/users/:id/status', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  const { status } = req.body;
  if (!['ACTIVE', 'DISABLED'].includes(status)) {
    return res.status(400).json({ error: 'Estado de cuenta de lector no válido.' });
  }

  const updated = await query(
    `UPDATE users
     SET status = $1,
         token_version = CASE WHEN $1 = 'DISABLED' THEN token_version + 1 ELSE token_version END
     WHERE id = $2
     RETURNING id, email, name, role, status, token_version, created_at, last_login`,
    [status, req.params.id]
  );

  if (updated.rows.length === 0) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  await logSecurityEvent(
    req.user.id,
    status === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED',
    'SUCCESS',
    'BOOKONE_ADMIN'
  );

  return res.json({ message: 'Estado del lector actualizado correctamente.', user: updated.rows[0] });
});

// Privilegio exclusivo ADMINISTRADOR: revocar sesiones activas (Sección 5.3)
router.post('/users/:id/revoke-sessions', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  const updated = await query(
    `UPDATE users SET token_version = token_version + 1 WHERE id = $1
     RETURNING id, email, name, role, status, token_version`,
    [req.params.id]
  );

  if (updated.rows.length === 0) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  await logSecurityEvent(req.user.id, 'SESSION_REVOKED', 'SUCCESS', 'BOOKONE_ADMIN');
  return res.json({ message: 'Sesiones del usuario revocadas correctamente.', user: updated.rows[0] });
});

// Privilegio exclusivo ADMINISTRADOR: consultar bitácora de seguridad (Sección 5.2, 5.3, 16)
router.get('/events', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  const result = await query('SELECT * FROM security_events ORDER BY created_at ASC LIMIT 250');
  return res.json({ events: result.rows });
});

// Privilegio exclusivo ADMINISTRADOR: asignar o modificar roles (Sección 5.3 y 16)
router.patch('/users/:id/role', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeDatabase();
  if (!isValidUUID(req.params.id)) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  const { role } = req.body;
  if (!['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'].includes(role)) {
    return res.status(400).json({ error: 'El rol solicitado no es válido.' });
  }

  const updated = await query(
    `UPDATE users SET role = $1, token_version = token_version + 1 WHERE id = $2
     RETURNING id, email, name, role, status, token_version, created_at, last_login`,
    [role, req.params.id]
  );

  if (updated.rows.length === 0) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  await logSecurityEvent(req.user.id, 'ROLE_CHANGED', 'SUCCESS', 'BOOKONE_ADMIN');

  return res.json({ message: 'Rol asignado con éxito.', user: updated.rows[0] });
});

export default router;