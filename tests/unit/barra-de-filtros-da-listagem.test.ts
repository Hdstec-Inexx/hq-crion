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
  assert.match(barra, /type="number"/);
  assert.match(barra, /step="0\.1"/);
  assert.match(barra, /multiple/);
  assert.match(barra, /type="date"/);
  assert.match(barra, />Filtrar</);
  assert.match(barra, />\s*Limpar\s*</);
});
