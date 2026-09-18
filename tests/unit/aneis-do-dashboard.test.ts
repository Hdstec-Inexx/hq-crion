import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

test('legenda do anel lista só fatias visíveis e o drill-down fica no DestinoDoGrafico', () => {
  const anel = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../apps/web/src/features/dashboard/GraficoAnel.tsx'),
    'utf8'
  );
  const destino = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../apps/web/src/features/dashboard/DestinoDoGrafico.tsx'),
    'utf8'
  );

  assert.match(anel, /<ul className="dashboard-anel-legenda">\s*\{fatias\.map/);
  assert.match(anel, /<DestinoDoGrafico/);
  assert.doesNotMatch(anel, /<Tooltip/);
  assert.match(destino, /navigate\(destino\)/);
});

test('ADR 0007 grava paleta Crion e ordem deslocada dos anéis', () => {
  const adr = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../docs/adr/0007-aneis-paleta-crion-ordem-deslocada.md'),
    'utf8'
  );

  assert.match(adr, /coresDoAnel/);
  assert.match(adr, /deslocamento 0/);
  assert.match(adr, /deslocamento 1/);
  assert.match(adr, /#5EC4BE/i);
});

test('coresDoAnel não usa os hex da paleta GEAP', () => {
  const cores = coresDoAnel(8, 0).map((cor) => cor.toLowerCase());
  const geap = new Set(paletaGeap.map((cor) => cor.toLowerCase()));

  for (const cor of cores) {
    assert.equal(geap.has(cor), false, `cor ${cor} pertence à paleta GEAP`);
  }
});

function matizEmGraus(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) {
    return 0;
  }
  let h = 0;
  if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return (h * 60 + 360) % 360;
}

test('coresDoAnel usa matizes distintos a partir do ciano Crion', () => {
  const cores = coresDoAnel(8, 0);
  assert.equal(cores[0]?.toLowerCase(), '#5ec4be');
  assert.equal(new Set(cores).size, cores.length);
  const faixas = new Set(cores.map((cor) => Math.round(matizEmGraus(cor) / 40)));
  assert.ok(faixas.size >= 5, `esperado ≥5 faixas de matiz, veio ${faixas.size}`);
});
