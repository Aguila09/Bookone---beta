import jwt from 'jsonwebtoken';

import { canAccessRoleAction } from '../utils/authorization.js';
import { store } from '../store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function authRequired(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = store.users.find((item) => item.id === payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado para el token.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Cuenta inactiva.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const allowed = roles.some((role) => canAccessRoleAction(req.user.role, role));

    if (!allowed) {
      return res.status(403).json({ error: 'No tiene permisos suficientes para esta operación.' });
    }

    return next();
  };
}

export function signToken(userId, expiresIn = '1h') {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
}
