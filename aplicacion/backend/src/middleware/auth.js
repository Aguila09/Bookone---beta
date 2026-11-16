import jwt from 'jsonwebtoken';

import { isValidUUID, query } from '../db.js';
import { canAccessRoleAction } from '../utils/authorization.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export async function authRequired(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!isValidUUID(payload.userId)) {
      return res.status(401).json({ error: 'Token inválido para la base de datos.' });
    }

    const result = await query(
      'SELECT id, email, name, role, status, token_version, created_at, last_login FROM users WHERE id = $1',
      [payload.userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado para el token.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Cuenta inactiva.' });
    }

    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.token_version) {
      return res.status(401).json({ error: 'La sesión fue revocada por el administrador.' });
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

export function signToken(userId, expiresIn = '1h', extraClaims = {}) {
  return jwt.sign({ userId, ...extraClaims }, JWT_SECRET, { expiresIn });
}