import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { queryAposFiltrar } from '../../apps/web/src/features/atendimentos/query-apos-filtrar.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('queryAposFiltrar sincroniza e limpa o parâmetro cpf', () => {
  const comCpf = new FormData();
  comCpf.set('cpf', '529.982.247-25');

  const proximaComCpf = queryAposFiltrar(
    new URLSearchParams('administradora=Affix&agente=affix-0800'),
    comCpf
  );
  assert.equal(proximaComCpf.get('cpf'), '529.982.247-25');

  const semCpf = new FormData();
  semCpf.set('cpf', '');

  const proximaSemCpf = queryAposFiltrar(
    new URLSearchParams('administradora=Affix&agente=affix-0800&cpf=529.982.247-25'),
    semCpf
  );
  assert.equal(proximaSemCpf.has('cpf'), false);
  assert.equal(proximaSemCpf.get('cpf'), null);
});

test('BarraDeFiltrosDaListagem renderiza campo de CPF com controle de rascunho e chave de limpeza', () => {
  const barra = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/BarraDeFiltrosDaListagem.tsx'),
    'utf8'
  );

  assert.match(barra, /campoVisivel\('cpf'\)/);
  assert.match(barra, /name="cpf"/);
  assert.match(barra, /placeholder="Buscar por CPF"/);
  assert.match(barra, /key=\{`cpf-\$\{searchParams\.get\('cpf'\)/);
});

test('ListagemAtendimentos exibe CPF nos metadados da linha quando presente', () => {
  const listagem = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/ListagemAtendimentos.tsx'),
    'utf8'
  );

  assert.match(listagem, /item\.cpf/);
  assert.match(listagem, /CPF:\s*\{formatarCpf\(item\.cpf\)\}|CPF:\s*\$\{formatarCpf\(item\.cpf\)\}/);
});

test('DetalheAtendimento exibe CPF na grade de fatos quando presente', () => {
  const detalhe = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/DetalheAtendimento.tsx'),
    'utf8'
  );

  assert.match(detalhe, /atendimento\.cpf/);
  assert.match(detalhe, /<dt>CPF<\/dt>/);
  assert.match(detalhe, /formatarCpf\(atendimento\.cpf\)/);
});

test('FavoritosPage exibe CPF e Data da Curadoria nos metadados da linha quando presentes', () => {
  const favoritos = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FavoritosPage.tsx'),
    'utf8'
  );

  assert.match(favoritos, /item\.cpf/);
  assert.match(favoritos, /CPF:\s*\$\{formatarCpf\(item\.cpf\)\}/);
  assert.match(favoritos, /Data da Curadoria:\s*\$\{formatarQuando\(item\.curadaEm\)\}/);
});
