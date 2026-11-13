import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessRoleAction,
  canAccessResource,
  ROLE_PRIORITY,
} from '../src/utils/authorization.js';

test('Role validation blocks client access to admin-only actions', () => {
  assert.equal(canAccessRoleAction('CLIENTE', 'ADMINISTRADOR'), false);
  assert.equal(canAccessRoleAction('OPERADOR', 'ADMINISTRADOR'), false);
  assert.equal(canAccessRoleAction('ADMINISTRADOR', 'ADMINISTRADOR'), true);
});

test('Operator can access catalog operations but cannot assign roles', () => {
  assert.equal(canAccessResource('OPERADOR', 'CATALOGO'), true);
  assert.equal(canAccessResource('CLIENTE', 'CATALOGO'), true);
  assert.equal(canAccessResource('CLIENTE', 'ROLES'), false);
  assert.equal(ROLE_PRIORITY.ADMINISTRADOR > ROLE_PRIORITY.OPERADOR, true);
});
