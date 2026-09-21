import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  coresDoAnel,
  fatiasVisiveisDoAnel,
  fraseDaFatia
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

test('fatiasVisiveisDoAnel ordenam por quantidade decrescente', () => {
  assert.deepEqual(
    fatiasVisiveisDoAnel([
      { nome: 'Carência', valor: 1 },
      { nome: 'Boleto', valor: 5 },
      { nome: 'Saudação', valor: 0 },
      { nome: 'Protocolo', valor: 3 }
    ]),
    [
      { nome: 'Boleto', valor: 5 },
      { nome: 'Protocolo', valor: 3 },
      { nome: 'Carência', valor: 1 }
    ]
  );
});

test('fraseDaFatia junta nome, quantidade pt-BR e participação inteira', () => {
  assert.equal(fraseDaFatia('Protocolo', 2, 40), 'Protocolo · 2 · 40%');
  assert.equal(fraseDaFatia('Boleto', 1234, 41.6), 'Boleto · 1.234 · 42%');
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
  assert.match(anel, /coresDoAnel\(fatias\.length, deslocamento\)/);
  assert.doesNotMatch(anel, /coresDoAnel\(dados\.length/);
  assert.doesNotMatch(anel, /indiceDaFatia/);
  assert.match(anel, /<DestinoDoGrafico/);
  assert.match(anel, /fraseDaFatia/);
  assert.match(anel, /irAFatia\(item\.nome\)/);
  assert.match(anel, /destinoDaLinha/);
  assert.match(anel, /<Sector/);
  assert.match(anel, /onClick=\{\(evento\) => \{\s*evento\.stopPropagation\(\);\s*irAFatia/);
  assert.match(anel, /pointerType === 'touch'/);
  assert.match(anel, /tabIndex=\{0\}/);
  assert.match(anel, /onKeyDown/);
  assert.match(anel, /fatiaEmDestaque/);
  assert.doesNotMatch(anel, /navigate\(destino\)/);
  assert.match(destino, /navigate\(destino\)/);
  assert.match(destino, /dashboard-anel-miolo/);
  assert.doesNotMatch(destino, /destinoDaFatia|destinoDaLinha/);
  assert.doesNotMatch(destino, /<button[\s\S]*\{children\}[\s\S]*<\/button>/);
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
  assert.match(adr, /decrescente/);
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

test('anel compacto tem 160px e as barras de percentual são trilhos, não Recharts', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const anel = readFileSync(join(raiz, 'apps/web/src/features/dashboard/GraficoAnel.tsx'), 'utf8');
  const barras = readFileSync(join(raiz, 'apps/web/src/features/dashboard/GraficoBarras.tsx'), 'utf8');
  const paineis = readFileSync(
    join(raiz, 'apps/web/src/features/dashboard/PaineisDoDashboard.tsx'),
    'utf8'
  );
  const css = readFileSync(join(raiz, 'apps/web/src/styles/dashboard.css'), 'utf8');

  assert.match(anel, /const tamanhoDoAnel = 160/);
  assert.match(css, /\.dashboard-anel-frame \{[\s\S]*width: 160px/);
  assert.match(css, /width: min\(1240px, 100%\)/);
  assert.match(css, /grid-template-areas:/);
  assert.match(css, /'motivos nao-conformidade'/);
  assert.match(css, /'concordancia acerto'/);
  assert.match(css, /'piores \.'/);
  assert.match(css, /\.dashboard-paineis \{[\s\S]*gap: 22px/);
  assert.match(css, /padding: clamp\(24px, 4vw, 38px\)/);
  assert.match(css, /max-height: 190px/);
  assert.match(paineis, /dashboard-painel-motivos[\s\S]*dashboard-painel-nao-conformidade[\s\S]*dashboard-painel-concordancia[\s\S]*dashboard-painel-acerto[\s\S]*dashboard-painel-piores/);
  assert.doesNotMatch(barras, /recharts/);
  assert.match(barras, /dashboard-barra-trilho/);
  assert.match(paineis, /dashboard-concordancia-resumo/);
  assert.match(paineis, /<small>Nota<\/small>/);
  assert.match(paineis, /<small>Critérios<\/small>/);
  assert.match(paineis, /className="dashboard-piores"/);
  assert.match(css, /height: 7px/);
  assert.match(css, /dashboard-anel-miolo/);
  assert.match(css, /dashboard-anel-frase/);
});
