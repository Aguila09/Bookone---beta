export const ROLE_PRIORITY = {
  CLIENTE: 1,
  OPERADOR: 2,
  ADMINISTRADOR: 3,
};

export const RESOURCE_RULES = {
  CATALOGO: ['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'],
  PRODUCTOS: ['OPERADOR', 'ADMINISTRADOR'],
  PEDIDOS: ['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'],
  ROLES: ['ADMINISTRADOR'],
  USUARIOS: ['ADMINISTRADOR'],
  SEGURIDAD: ['ADMINISTRADOR'],
  DESCARGAS: ['CLIENTE', 'OPERADOR', 'ADMINISTRADOR'],
};

export function canAccessRoleAction(actorRole, requiredRole) {
  const actorPriority = ROLE_PRIORITY[actorRole] ?? 0;
  const requiredPriority = ROLE_PRIORITY[requiredRole] ?? 0;
  return actorPriority >= requiredPriority;
}

export function canAccessResource(actorRole, resource) {
  const allowedRoles = RESOURCE_RULES[resource] || [];
  return allowedRoles.includes(actorRole) || canAccessRoleAction(actorRole, 'ADMINISTRADOR');
}
