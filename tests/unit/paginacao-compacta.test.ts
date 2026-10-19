import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compactPageItems } from '../../apps/web/src/features/atendimentos/compactPageItems.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('compactPageItems retorna vazio para totalPages menor ou igual a 0', () => {
  assert.deepEqual(compactPageItems(1, 0), []);
  assert.deepEqual(compactPageItems(1, -5), []);
});

test('compactPageItems com 1 página retorna [1]', () => {
  assert.deepEqual(compactPageItems(1, 1), [1]);
});

test('compactPageItems exibe todas as páginas quando totalPages <= 7', () => {
  assert.deepEqual(compactPageItems(1, 2), [1, 2]);
  assert.deepEqual(compactPageItems(1, 3), [1, 2, 3]);
  assert.deepEqual(compactPageItems(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(compactPageItems(1, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(compactPageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(compactPageItems(7, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('compactPageItems janela inicial quando current <= 4 em lista com mais de 7 páginas', () => {
  // Para totalPages = 10
  assert.deepEqual(compactPageItems(1, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(2, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(3, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(4, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);

  // Para totalPages = 48 (caso de uso da issue #131)
  assert.deepEqual(compactPageItems(1, 48), [1, 2, 3, 4, 5, 'ellipsis', 48]);
});

test('compactPageItems janela intermediária quando current > 4 e current < totalPages - 3', () => {
  // Para totalPages = 10: current = 5 e 6
  assert.deepEqual(compactPageItems(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(6, 10), [1, 'ellipsis', 5, 6, 7, 'ellipsis', 10]);

  // Para totalPages = 48 na página 20 (caso de uso da issue #131)
  assert.deepEqual(compactPageItems(20, 48), [1, 'ellipsis', 19, 20, 21, 'ellipsis', 48]);
});

test('compactPageItems janela final quando current >= totalPages - 3', () => {
  // Para totalPages = 10: totalPages - 3 = 7
  assert.deepEqual(compactPageItems(7, 10), [1, 'ellipsis', 6, 7, 8, 9, 10]);
  assert.deepEqual(compactPageItems(8, 10), [1, 'ellipsis', 6, 7, 8, 9, 10]);
  assert.deepEqual(compactPageItems(9, 10), [1, 'ellipsis', 6, 7, 8, 9, 10]);
  assert.deepEqual(compactPageItems(10, 10), [1, 'ellipsis', 6, 7, 8, 9, 10]);

  // Para totalPages = 48 na última página
  assert.deepEqual(compactPageItems(48, 48), [1, 'ellipsis', 44, 45, 46, 47, 48]);
});

test('compactPageItems no ponto de transição em 8 páginas', () => {
  // totalPages = 8: current <= 4 inicial, current >= 5 final
  assert.deepEqual(compactPageItems(1, 8), [1, 2, 3, 4, 5, 'ellipsis', 8]);
  assert.deepEqual(compactPageItems(4, 8), [1, 2, 3, 4, 5, 'ellipsis', 8]);
  assert.deepEqual(compactPageItems(5, 8), [1, 'ellipsis', 4, 5, 6, 7, 8]);
  assert.deepEqual(compactPageItems(8, 8), [1, 'ellipsis', 4, 5, 6, 7, 8]);
});

test('compactPageItems normaliza current menor que 1 ou maior que totalPages', () => {
  assert.deepEqual(compactPageItems(0, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(-3, 10), [1, 2, 3, 4, 5, 'ellipsis', 10]);
  assert.deepEqual(compactPageItems(99, 10), [1, 'ellipsis', 6, 7, 8, 9, 10]);
});

test('ListagemAtendimentos substitui texto plano Página X de Y por PaginacaoCompacta', () => {
  const tsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/ListagemAtendimentos.tsx'),
    'utf8'
  );

  // Não contém mais o texto plano
  assert.equal(/Página\s*\{listagem\.pagina\}\s*de/.test(tsx), false);

  // Usa PaginacaoCompacta passando pagina, totalPaginas e irPara
  assert.match(tsx, /import\s*\{[^}]*PaginacaoCompacta[^}]*\}\s*from/);
  assert.match(tsx, /<PaginacaoCompacta[\s\S]*?pagina=\{listagem\.pagina\}[\s\S]*?irPara=\{irPara\}/);
});

test('FavoritosPage e FilaDeManutencao adotam PaginacaoCompacta', () => {
  const favoritosTsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FavoritosPage.tsx'),
    'utf8'
  );
  assert.equal(/Página\s*\{listagem\.pagina\}\s*de/.test(favoritosTsx), false);
  assert.match(favoritosTsx, /import\s*\{[^}]*PaginacaoCompacta[^}]*\}\s*from/);
  assert.match(favoritosTsx, /<PaginacaoCompacta[\s\S]*?pagina=\{listagem\.pagina\}[\s\S]*?irPara=\{irPara\}/);

  const filaTsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FilaDeManutencao.tsx'),
    'utf8'
  );
  assert.equal(/Página\s*\{listagem\.pagina\}\s*de/.test(filaTsx), false);
  assert.match(filaTsx, /import\s*\{[^}]*PaginacaoCompacta[^}]*\}\s*from/);
  assert.match(filaTsx, /<PaginacaoCompacta[\s\S]*?pagina=\{listagem\.pagina\}[\s\S]*?irPara=\{irPara\}/);
});

test('PaginacaoCompacta define aria-current="page", botões de extremidade e itens', () => {
  const tsx = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/PaginacaoCompacta.tsx'),
    'utf8'
  );

  assert.match(tsx, /aria-current=\{item === pagina \? 'page' : undefined\}/);
  assert.match(tsx, /aria-label=\{`Página \$\{item\}`\}/);
  assert.match(tsx, /aria-label="Página anterior"/);
  assert.match(tsx, /aria-label="Próxima página"/);
  assert.match(tsx, /disabled=\{pagina <= 1\}/);
  assert.match(tsx, /disabled=\{pagina >= totalPaginas\}/);
  assert.match(tsx, /onClick=\{\(\) => irPara\(item\)\}/);
  assert.match(tsx, /onClick=\{\(\) => irPara\(pagina - 1\)\}/);
  assert.match(tsx, /onClick=\{\(\) => irPara\(pagina \+ 1\)\}/);
});

test('listagens.css integra paginação compacta responsiva e harmonizada com design Crion', () => {
  const css = readFileSync(
    join(raiz, 'apps/web/src/styles/listagens.css'),
    'utf8'
  );

  assert.match(css, /\.listagem-paginacao/);
  assert.match(css, /\.listagem-paginacao-item/);
  assert.match(css, /\.listagem-paginacao-elipse/);
  assert.match(css, /\[aria-current="page"\]/);
  assert.match(css, /var\(--cyan\)/);
});
