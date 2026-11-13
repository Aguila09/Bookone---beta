import express from 'express';

import { authRequired, requireRole } from '../middleware/auth.js';
import { initializeStore, store } from '../store.js';

const router = express.Router();

// Listado de lectores y personal de la biblioteca
router.get('/users', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeStore();
  const safeUsers = store.users.map(({ password_hash, ...user }) => user);
  return res.json({ users: safeUsers });
});

// Resumen general de la biblioteca para el panel de administración
router.get('/stats', authRequired, requireRole('ADMINISTRADOR', 'OPERADOR'), async (req, res) => {
  await initializeStore();
  return res.json({
    totalBooks: store.products.length,
    activeBooks: store.products.filter((p) => p.status === 'ACTIVE').length,
    totalUsers: store.users.length,
    totalOrders: store.orders.length,
    totalDownloads: store.downloads.length,
    totalEvents: store.securityEvents.length,
    lastEvents: store.securityEvents.slice(-10).reverse(),
  });
});

// Modificar estado de cuenta de lector (Activa / Suspendida)
router.patch('/users/:id/status', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  const { status } = req.body;
  const user = store.users.find((item) => item.id === req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  if (!['ACTIVE', 'DISABLED'].includes(status)) {
    return res.status(400).json({ error: 'Estado de cuenta de lector no válido.' });
  }

  user.status = status;
  store.securityEvents.push({
    id: `${Date.now()}`,
    user_id: req.user.id,
    event: 'ACCOUNT_STATUS_CHANGED',
    created_at: new Date().toISOString(),
    result: status === 'DISABLED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_RESTORED',
    origin: 'BOOKONE_ADMIN',
  });

  return res.json({ message: 'Estado del lector actualizado correctamente.', user: { ...user, password_hash: undefined } });
});

// Registro de eventos de seguridad y auditoría criptográfica
router.get('/events', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  await initializeStore();
  return res.json({ events: store.securityEvents });
});

// Modificar rol de usuario (CLIENTE / Lector, OPERADOR / Curador, ADMINISTRADOR / Bibliotecario Mayor)
router.patch('/users/:id/role', authRequired, requireRole('ADMINISTRADOR'), async (req, res) => {
  const { role } = req.body;
  const user = store.users.find((item) => item.id === req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'Lector o usuario no encontrado.' });
  }

  if (!['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'].includes(role)) {
    return res.status(400).json({ error: 'El rol solicitado no es válido.' });
  }

  user.role = role;
  store.securityEvents.push({
    id: `${Date.now()}`,
    user_id: req.user.id,
    event: 'ROLE_CHANGED',
    created_at: new Date().toISOString(),
    result: 'SUCCESS',
    origin: 'BOOKONE_ADMIN',
  });

  return res.json({ message: 'Rol asignado con éxito.', user: { ...user, password_hash: undefined } });
});

export default router;
