import assert from 'node:assert/strict';
import test from 'node:test';
import { destinoInicial, marcaDaCasca } from '../../packages/contracts/src/casca.js';

test('faixa aberta: marca vai à primeira área do papel', () => {
  assert.deepEqual(marcaDaCasca({ papel: 'Admin', recolhida: false }), {
    destino: destinoInicial('Admin')
  });
  assert.deepEqual(marcaDaCasca({ papel: 'Gestão', recolhida: false }), {
    destino: '/dashboard'
  });
  assert.deepEqual(marcaDaCasca({ papel: 'Curador', recolhida: false }), {
    destino: '/atendimentos'
  });
});

test('faixa recolhida: marca ausente no trilho de ícones', () => {
  assert.equal(marcaDaCasca({ papel: 'Admin', recolhida: true }), null);
  assert.equal(marcaDaCasca({ papel: 'Gestão', recolhida: true }), null);
  assert.equal(marcaDaCasca({ papel: 'Curador', recolhida: true }), null);
});
