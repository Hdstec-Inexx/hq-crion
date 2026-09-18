import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coresDoAnel,
  fatiasVisiveisDoAnel
} from '../../apps/web/src/features/dashboard/coresDoAnel.js';

const paletaGeap = [
  '#1f6f5b',
  '#c45c26',
  '#2f5d8c',
  '#8a4f7d',
  '#b08900',
  '#4a6fa5',
  '#6b8f71',
  '#9c6644'
];

test('coresDoAnel com deslocamento 1 muda a primeira cor e a sequência', () => {
  const quantidade = 5;
  const ordemZero = coresDoAnel(quantidade, 0);
  const ordemUm = coresDoAnel(quantidade, 1);

  assert.equal(ordemZero.length, quantidade);
  assert.equal(ordemUm.length, quantidade);
  assert.notEqual(ordemZero[0], ordemUm[0]);
  assert.notDeepEqual(ordemZero, ordemUm);
});

test('fatiasVisiveisDoAnel omitem quantidade zero para não desenhar anel oco', () => {
  assert.deepEqual(
    fatiasVisiveisDoAnel([
      { nome: 'Saudação', valor: 0 },
      { nome: 'Protocolo', valor: 0 }
    ]),
    []
  );
  assert.deepEqual(
    fatiasVisiveisDoAnel([
      { nome: 'Saudação', valor: 0 },
      { nome: 'Protocolo', valor: 2 }
    ]),
    [{ nome: 'Protocolo', valor: 2 }]
  );
});

test('coresDoAnel não usa os hex da paleta GEAP', () => {
  const cores = coresDoAnel(8, 0).map((cor) => cor.toLowerCase());
  const geap = new Set(paletaGeap.map((cor) => cor.toLowerCase()));

  for (const cor of cores) {
    assert.equal(geap.has(cor), false, `cor ${cor} pertence à paleta GEAP`);
  }
});
