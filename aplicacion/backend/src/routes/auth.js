import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

import { authRequired, signToken } from '../middleware/auth.js';
import { initializeStore, store } from '../store.js';
import { hashPassword, verifyPassword } from '../utils/security.js';

const router = express.Router();

function logEvent(userId, event, result, origin = 'BOOKONE_AUTH') {
  store.securityEvents.push({
    id: randomUUID(),
    user_id: userId,
    event,
    created_at: new Date().toISOString(),
    result,
    origin,
  });
}

function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  return store.users.find((u) => {
    if (u.email && u.email.toLowerCase() === normalized) return true;
    if (Array.isArray(u.aliases) && u.aliases.some((a) => a.toLowerCase() === normalized)) return true;
    return false;
  });
}

router.post('/register', async (req, res) => {
  await initializeStore();
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Nombre de lector, correo y contraseña son obligatorios.' });
  }

  const exists = findUserByEmail(email);
  if (exists) {
    return res.status(409).json({ error: 'Ya existe una cuenta de lector registrada con ese correo en BOOKONE.' });
  }

  const passwordHash = await hashPassword(password);
  const user = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    password_hash: passwordHash,
    name: name.trim(),
    role: 'CLIENTE', // Rol de Lector Registrado
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    last_login: null,
  };

  store.users.push(user);
  logEvent(user.id, 'READER_REGISTERED', 'SUCCESS');

  const token = signToken(user.id);
  return res.status(201).json({
    message: 'Cuenta de lector en BOOKONE creada exitosamente.',
    token,
    user: { ...user, password_hash: undefined },
  });
});

router.post('/login', async (req, res) => {
  await initializeStore();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Correo de lector y contraseña requeridos.' });
  }

  const user = findUserByEmail(email);
  if (!user) {
    logEvent('desconocido', 'LOGIN_FAILED', 'FAILURE');
    return res.status(401).json({ error: 'Credenciales de acceso inválidas.' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    logEvent(user.id, 'LOGIN_FAILED', 'FAILURE');
    return res.status(401).json({ error: 'Credenciales de acceso inválidas.' });
  }

  if (user.status !== 'ACTIVE') {
    logEvent(user.id, 'ACCOUNT_BLOCKED', 'FAILURE');
    return res.status(403).json({ error: 'La credencial de lector se encuentra inactiva o suspendida.' });
  }

  user.last_login = new Date().toISOString();
  logEvent(user.id, 'LOGIN_SUCCESS', 'SUCCESS');

  const token = signToken(user.id);
  return res.json({
    token,
    user: { ...user, password_hash: undefined },
  });
});

router.get('/me', authRequired, async (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  const userOrders = store.orders.filter((o) => o.user_id === req.user.id);
  const totalBooksAcquired = userOrders.reduce((sum, o) => sum + (o.items ? o.items.length : 0), 0);

  return res.json({
    user: safeUser,
    stats: {
      ordersCount: userOrders.length,
      booksCount: totalBooksAcquired,
      libraryStatus: 'Lector Activo BOOKONE',
    },
  });
});

router.post('/recover-password', async (req, res) => {
  await initializeStore();
  const { email } = req.body;

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'No se encontró ninguna cuenta asociada a este correo.' });
  }

  const token = signToken(user.id, '15m');
  logEvent(user.id, 'PASSWORD_RESET_REQUESTED', 'SUCCESS');

  return res.json({
    message: 'Token de restablecimiento de contraseña de lector emitido.',
    token,
  });
});

router.post('/logout', authRequired, (req, res) => {
  logEvent(req.user.id, 'LOGOUT', 'SUCCESS');
  return res.json({ message: 'Sesión en BOOKONE finalizada de manera segura.' });
});

router.post('/reset-password', async (req, res) => {
  await initializeStore();
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Se requiere el token de recuperación y la nueva clave.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = store.users.find((item) => item.id === decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'Lector no encontrado.' });
    }

    user.password_hash = await hashPassword(newPassword);
    logEvent(user.id, 'PASSWORD_RESET_SUCCESS', 'SUCCESS');
    return res.json({ message: 'Contraseña actualizada con éxito en BOOKONE.' });
  } catch (error) {
    return res.status(400).json({ error: 'El token de recuperación es inválido o ha expirado.' });
  }
});

export default router;
