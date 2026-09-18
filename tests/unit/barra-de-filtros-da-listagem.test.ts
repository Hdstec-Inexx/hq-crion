import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { queryAposFiltrar } from '../../apps/web/src/features/atendimentos/query-apos-filtrar.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('Filtrar grava o rascunho na query e preserva Recorte', () => {
  const data = new FormData();
  data.set('inicio', '2026-09-01');
  data.set('fim', '2026-09-18');
  data.set('motivo', 'Boleto');
  data.set('notaIa', '7.5');
  data.set('conversa', '');
  data.append('criteriosAtendidos', 'Saudação');
  data.append('criteriosAtendidos', 'Identificação');

  const proxima = queryAposFiltrar(
    new URLSearchParams('administradora=Affix&agente=affix-0800&pagina=2&nota=9'),
    data
  );

  assert.equal(proxima.get('administradora'), 'Affix');
  assert.equal(proxima.get('agente'), 'affix-0800');
  assert.equal(proxima.get('inicio'), '2026-09-01');
  assert.equal(proxima.get('motivo'), 'Boleto');
  assert.equal(proxima.get('notaIa'), '7.5');
  assert.equal(proxima.get('criteriosAtendidos'), 'Saudação,Identificação');
  assert.equal(proxima.has('conversa'), false);
  assert.equal(proxima.has('pagina'), false);
  assert.equal(proxima.has('nota'), false);
});

test('Filtrar omite notaIa em 0 e remove valor fora do degrau', () => {
  const zero = new FormData();
  zero.set('notaIa', '0');
  const fora = new FormData();
  fora.set('notaIa', '7.3');

  assert.equal(queryAposFiltrar(new URLSearchParams('notaIa=7.5'), zero).has('notaIa'), false);
  assert.equal(queryAposFiltrar(new URLSearchParams('notaIa=7.5'), fora).has('notaIa'), false);
});

test('Filtrar ignora Recorte enviado no formulário', () => {
  const data = new FormData();
  data.set('administradora', 'Alter');
  data.set('agente', 'clara-alter');
  data.set('motivo', 'Boleto');

  const proxima = queryAposFiltrar(
    new URLSearchParams('administradora=Affix&agente=affix-0800'),
    data
  );

  assert.equal(proxima.get('administradora'), 'Affix');
  assert.equal(proxima.get('agente'), 'affix-0800');
  assert.equal(proxima.get('motivo'), 'Boleto');
});

test('página da listagem monta a barra e deixa Recorte no header', () => {
  const pagina = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/ListagemAtendimentos.tsx'),
    'utf8'
  );
  const barra = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/BarraDeFiltrosDaListagem.tsx'),
    'utf8'
  );

  assert.match(pagina, /<BarraDeFiltrosDaListagem/);
  assert.match(pagina, /<RecorteCascata/);
  assert.doesNotMatch(pagina, /className="listagem-filtros"/);
  assert.doesNotMatch(pagina, /buscarRegua/);
  assert.match(barra, /className="listagem-filtros"/);
  assert.match(barra, /<SliderNotaDaIaAvaliadora/);
  assert.doesNotMatch(barra, /type="number"/);
  assert.doesNotMatch(barra, /step="0\.1"/);
  assert.match(barra, /multiple/);
  assert.match(barra, /type="date"/);
  assert.match(barra, />Filtrar</);
  assert.match(barra, />\s*Limpar\s*</);
});

test('slider Nota da IA Avaliadora usa range 0–10 com passo 0,5 e output visível', () => {
  const slider = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/SliderNotaDaIaAvaliadora.tsx'),
    'utf8'
  );

  assert.match(slider, /Nota da IA Avaliadora/);
  assert.match(slider, /type="range"/);
  assert.match(slider, /min="0"/);
  assert.match(slider, /max="10"/);
  assert.match(slider, /step="0\.5"/);
  assert.match(slider, /<output/);
});
