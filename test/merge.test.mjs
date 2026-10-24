import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, missing, revert } from '../src/merge.mjs';

test('apply agrega el fragmento sin pisar lo que ya había', () => {
  const target = { hooks: { SessionStart: [] }, permissions: { deny: ['Bash(rm -rf /)'] } };
  apply(target, { permissions: { deny: ['Edit(./.husky/**)'] }, sandbox: { enabled: true } });
  assert.deepEqual(target, {
    hooks: { SessionStart: [] },
    permissions: { deny: ['Bash(rm -rf /)', 'Edit(./.husky/**)'] },
    sandbox: { enabled: true },
  });
});

test('apply no duplica elementos que ya estaban', () => {
  const target = { permissions: { deny: ['Edit(./.husky/**)'] } };
  const operations = apply(target, { permissions: { deny: ['Edit(./.husky/**)'] } });
  assert.deepEqual(operations, []);
  assert.deepEqual(target.permissions.deny, ['Edit(./.husky/**)']);
});

test('revert deja el objeto exactamente como estaba', () => {
  const original = { sandbox: { enabled: false, network: { allowedDomains: ['example.org'] } }, env: { A: '1' } };
  const target = structuredClone(original);
  const operations = apply(target, {
    sandbox: { enabled: true, network: { allowedDomains: ['github.com'], allowLocalBinding: true } },
    permissions: { deny: ['Edit(./.husky/**)'] },
  });
  revert(target, operations);
  assert.deepEqual(target, original);
});

test('revert respeta lo que el usuario agregó después', () => {
  const target = {};
  const operations = apply(target, { permissions: { deny: ['Edit(./.husky/**)'] } });
  target.permissions.deny.push('Edit(./secret/**)');
  revert(target, operations);
  assert.deepEqual(target, { permissions: { deny: ['Edit(./secret/**)'] } });
});

test('revert no restaura un valor que el usuario cambió después', () => {
  const target = { sandbox: { enabled: false } };
  const operations = apply(target, { sandbox: { enabled: true } });
  target.sandbox.enabled = 'cambiado';
  revert(target, operations);
  assert.equal(target.sandbox.enabled, 'cambiado');
});

test('apply falla si una clave choca con otro tipo', () => {
  assert.throws(() => apply({ sandbox: true }, { sandbox: { enabled: true } }), /no es un objeto/);
  assert.throws(() => apply({ permissions: { deny: 'x' } }, { permissions: { deny: ['y'] } }), /no es una lista/);
});

test('missing lista lo que falta y no modifica el target', () => {
  const target = { sandbox: { enabled: true } };
  assert.deepEqual(missing(target, { sandbox: { enabled: true, failIfUnavailable: true } }), ['sandbox.failIfUnavailable']);
  assert.deepEqual(target, { sandbox: { enabled: true } });
  assert.deepEqual(missing(target, { sandbox: { enabled: true } }), []);
});
