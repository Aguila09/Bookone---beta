import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

import { initializeDatabase, isValidUUID, logSecurityEvent, query, withTransaction } from '../db.js';
import { authRequired, signToken } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../utils/security.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  await initializeDatabase();
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Nombre de lector, correo y contraseña son obligatorios.' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Ya existe una cuenta de lector registrada con ese correo en BOOKONE.' });
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  const inserted = await query(
    `INSERT INTO users (id, email, password_hash, name, role, status, token_version, created_at)
     VALUES ($1, $2, $3, $4, 'CLIENTE', 'ACTIVE', 1, NOW())
     RETURNING id, email, name, role, status, token_version, created_at, last_login`,
    [userId, normalizedEmail, passwordHash, name.trim()]
  );

  const user = inserted.rows[0];
  await logSecurityEvent(user.id, 'READER_REGISTERED', 'SUCCESS', 'BOOKONE_AUTH');

  const token = signToken(user.id, '1h', { tokenVersion: user.token_version });
  return res.status(201).json({
    message: 'Cuenta de lector en BOOKONE creada exitosamente.',
    token,
    user,
  });
});

router.post('/login', async (req, res) => {
  await initializeDatabase();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo de lector y contraseña requeridos.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  const user = result.rows[0];

  if (!user) {
    await logSecurityEvent(null, 'LOGIN_FAILED', 'FAILURE', 'BOOKONE_AUTH');
    return res.status(401).json({ error: 'Credenciales de acceso inválidas.' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await logSecurityEvent(user.id, 'LOGIN_FAILED', 'FAILURE', 'BOOKONE_AUTH');
    return res.status(401).json({ error: 'Credenciales de acceso inválidas.' });
  }

  if (user.status !== 'ACTIVE') {
    await logSecurityEvent(user.id, 'ACCOUNT_BLOCKED', 'FAILURE', 'BOOKONE_AUTH');
    return res.status(403).json({ error: 'La credencial de lector se encuentra inactiva o suspendida.' });
  }

  if (user.role !== 'CLIENTE') {
    await logSecurityEvent(user.id, 'LOGIN_FAILED', 'FAILURE', 'BOOKONE_WEB_AUTH_RESTRICTED');
    return res.status(403).json({
      error: 'El acceso de OPERADOR y ADMINISTRADOR está restringido exclusivamente a administración por SSH.',
    });
  }

  const updated = await query(
    `UPDATE users SET last_login = NOW() WHERE id = $1
     RETURNING id, email, name, role, status, token_version, created_at, last_login`,
    [user.id]
  );

  await logSecurityEvent(user.id, 'LOGIN_SUCCESS', 'SUCCESS', 'BOOKONE_AUTH');

  const safeUser = updated.rows[0];
  const token = signToken(safeUser.id, '1h', { tokenVersion: safeUser.token_version });
  return res.json({
    token,
    user: safeUser,
  });
});

router.get('/me', authRequired, async (req, res) => {
  const statsRes = await query(
    `SELECT
       COUNT(DISTINCT o.id)::int AS orders_count,
       COUNT(oi.product_id)::int AS books_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1`,
    [req.user.id]
  );

  const stats = statsRes.rows[0] || { orders_count: 0, books_count: 0 };

  return res.json({
    user: req.user,
    stats: {
      ordersCount: stats.orders_count,
      booksCount: stats.books_count,
      libraryStatus: 'Lector Activo BOOKONE',
    },
  });
});

// Privilegio de CLIENTE: modificar su propio perfil (Sección 5.1)
router.patch('/me', authRequired, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;

  if (!name && !newPassword) {
    return res.status(400).json({ error: 'Debe proporcionar un nuevo nombre o una nueva contraseña.' });
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Debe confirmar su contraseña actual para cambiarla.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    const userRow = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await verifyPassword(currentPassword, userRow.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }

    const newHash = await hashPassword(newPassword);
    const updated = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           password_hash = $2,
           token_version = token_version + 1
       WHERE id = $3
       RETURNING id, email, name, role, status, token_version, created_at, last_login`,
      [name ? String(name).trim() : null, newHash, req.user.id]
    );

    await logSecurityEvent(req.user.id, 'PASSWORD_RESET', 'SUCCESS', 'BOOKONE_PROFILE');
    const freshToken = signToken(req.user.id, '1h', { tokenVersion: updated.rows[0].token_version });
    return res.json({ message: 'Perfil y contraseña actualizados.', user: updated.rows[0], token: freshToken });
  }

  const updated = await query(
    `UPDATE users SET name = $1 WHERE id = $2
     RETURNING id, email, name, role, status, token_version, created_at, last_login`,
    [String(name).trim(), req.user.id]
  );

  await logSecurityEvent(req.user.id, 'PROFILE_UPDATED', 'SUCCESS', 'BOOKONE_PROFILE');
  return res.json({ message: 'Perfil actualizado correctamente.', user: updated.rows[0] });
});

router.post('/recover-password', async (req, res) => {
  await initializeDatabase();
  const { email } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const result = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: 'No se encontró ninguna cuenta asociada a este correo.' });
  }

  const resetTokenId = randomUUID();
  const token = signToken(user.id, '15m', { purpose: 'password_reset', jti: resetTokenId });
  await logSecurityEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'SUCCESS', 'BOOKONE_AUTH');

  return res.json({
    message: 'Token de restablecimiento de un solo uso emitido (expira en 15 minutos).',
    token,
  });
});

router.post('/logout', authRequired, async (req, res) => {
  await logSecurityEvent(req.user.id, 'LOGOUT', 'SUCCESS', 'BOOKONE_AUTH');
  return res.json({ message: 'Sesión en BOOKONE finalizada de manera segura.' });
});

// Token de recuperación con expiración y de un solo uso (Sección 7.1)
router.post('/reset-password', async (req, res) => {
  await initializeDatabase();
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Se requiere el token de recuperación y la nueva clave.' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    if (decoded.purpose !== 'password_reset' || !isValidUUID(decoded.userId) || !isValidUUID(decoded.jti)) {
      return res.status(400).json({ error: 'Token de recuperación inválido.' });
    }

    const alreadyUsed = await query('SELECT jti FROM used_reset_tokens WHERE jti = $1', [decoded.jti]);
    if (alreadyUsed.rows.length > 0) {
      return res.status(400).json({ error: 'Este token de recuperación ya fue utilizado.' });
    }

    const passwordHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [decoded.userId]);
      if (userCheck.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      await client.query(
        'INSERT INTO used_reset_tokens (jti, user_id, used_at) VALUES ($1, $2, NOW())',
        [decoded.jti, decoded.userId]
      );

      await client.query(
        'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
        [passwordHash, decoded.userId]
      );

      await logSecurityEvent(decoded.userId, 'PASSWORD_RESET', 'SUCCESS', 'BOOKONE_AUTH', client);
    });

    return res.json({ message: 'Contraseña actualizada con éxito en BOOKONE.' });
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'Lector no encontrado.' });
    }
    return res.status(400).json({ error: 'El token de recuperación es inválido o ha expirado.' });
  }
});

export default router;