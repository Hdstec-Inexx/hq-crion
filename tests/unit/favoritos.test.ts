import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import {
  atendimentoDetalheSchema,
  favoritoMutacaoResponseSchema
} from '../../packages/contracts/src/atendimento.js';

process.env.NODE_ENV = 'test';

async function sessaoDe(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string
) {
  const login = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email, senha: 'crion-hq' }
  });

  return loginResponseSchema.parse(login.json()).sessao;
}

test('POST e DELETE /atendimentos/:id/favorito sem sessão respondem 401', async () => {
  const app = await buildApp();

  try {
    const postSemSessao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito'
    });
    const deleteSemSessao = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/a1/favorito'
    });

    assert.equal(postSemSessao.statusCode, 401);
    assert.equal(deleteSemSessao.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('Apenas Curador pode mutar favorito; Admin e Gestão recebem 403 Forbidden', async () => {
  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');

    // Admin
    const postAdmin = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const deleteAdmin = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(postAdmin.statusCode, 403);
    assert.equal(deleteAdmin.statusCode, 403);

    // Gestão
    const postGestao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    const deleteGestao = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });

    assert.equal(postGestao.statusCode, 403);
    assert.equal(deleteGestao.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('POST e DELETE /atendimentos/:id/favorito para id inexistente respondem 404 Not Found', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    const postInexistente = await app.inject({
      method: 'POST',
      url: '/atendimentos/id-inexistente/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const deleteInexistente = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/id-inexistente/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });

    assert.equal(postInexistente.statusCode, 404);
    assert.equal(deleteInexistente.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('Curador favorita e desfavorita com idempotência e GET /atendimentos/:id reflete estado', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');

    // 1. Inicialmente, a1 não está favoritado pelo usuário
    const getInicial = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(getInicial.statusCode, 200);
    const detalheInicial = atendimentoDetalheSchema.parse(getInicial.json());
    assert.equal(detalheInicial.favoritadoPeloUsuario, false);
    assert.equal(detalheInicial.favoritos?.count ?? 0, 0);

    // 2. Curador favorita o atendimento
    const post1 = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(post1.statusCode, 200);
    const respPost1 = favoritoMutacaoResponseSchema.parse(post1.json());
    assert.equal(respPost1.favoritadoPeloUsuario, true);

    // 3. Idempotência: favoritar novamente retorna 200 com favoritadoPeloUsuario = true
    const post2 = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(post2.statusCode, 200);
    const respPost2 = favoritoMutacaoResponseSchema.parse(post2.json());
    assert.equal(respPost2.favoritadoPeloUsuario, true);

    // 4. GET /atendimentos/a1 pelo Curador mostra favoritadoPeloUsuario = true e perfis
    const getAposFavoritarCurador = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(getAposFavoritarCurador.statusCode, 200);
    const detalheCurador = atendimentoDetalheSchema.parse(getAposFavoritarCurador.json());
    assert.equal(detalheCurador.favoritadoPeloUsuario, true);
    assert.equal(detalheCurador.favoritos?.count, 1);
    assert.deepEqual(detalheCurador.favoritos?.perfis, [
      { id: 'perfil-carla', nome: 'Carla Mendes' }
    ]);

    // 5. GET /atendimentos/a1 pela Gestão mostra favoritadoPeloUsuario = false, mas count = 1 e perfis
    const getAposFavoritarGestao = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(getAposFavoritarGestao.statusCode, 200);
    const detalheGestao = atendimentoDetalheSchema.parse(getAposFavoritarGestao.json());
    assert.equal(detalheGestao.favoritadoPeloUsuario, false);
    assert.equal(detalheGestao.favoritos?.count, 1);
    assert.deepEqual(detalheGestao.favoritos?.perfis, [
      { id: 'perfil-carla', nome: 'Carla Mendes' }
    ]);

    // 6. Curador desfavorita o atendimento
    const delete1 = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(delete1.statusCode, 200);
    const respDel1 = favoritoMutacaoResponseSchema.parse(delete1.json());
    assert.equal(respDel1.favoritadoPeloUsuario, false);

    // 7. Idempotência: desfavoritar novamente retorna 200 com favoritadoPeloUsuario = false
    const delete2 = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(delete2.statusCode, 200);
    const respDel2 = favoritoMutacaoResponseSchema.parse(delete2.json());
    assert.equal(respDel2.favoritadoPeloUsuario, false);

    // 8. GET /atendimentos/a1 volta a ter count = 0 e favoritadoPeloUsuario = false
    const getAposDesfavoritar = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(getAposDesfavoritar.statusCode, 200);
    const detalheAposDel = atendimentoDetalheSchema.parse(getAposDesfavoritar.json());
    assert.equal(detalheAposDel.favoritadoPeloUsuario, false);
    assert.equal(detalheAposDel.favoritos?.count, 0);
  } finally {
    await app.close();
  }
});

test('repositorioPostgres implementa favoritar, desfavoritar e obterFavoritos com verificação relacional', async () => {
  const { repositorioPostgres } = await import(
    '../../apps/api/src/modules/atendimentos/postgres.js'
  );

  const consultas: Array<{ sql: string; valores?: unknown[] }> = [];
  const fakePool = {
    async query(sql: string, valores?: unknown[]) {
      consultas.push({ sql, valores });
      if (sql.includes('SELECT 1 FROM hq_atendimento')) {
        const id = valores?.[0];
        if (id === 'atend-inexistente') {
          return { rows: [] };
        }
        return { rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('SELECT f.perfil_id, p.nome, f.favoritado_em')) {
        return {
          rows: [
            { perfil_id: 'perfil-1', nome: 'Curador 1', favoritado_em: '2026-10-09T10:00:00Z' }
          ]
        };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        query: fakePool.query,
        release() {}
      };
    }
  };

  const repo = repositorioPostgres(fakePool);

  // Inexistente
  assert.equal(await repo.favoritar('atend-inexistente', 'p1'), 'ausente');
  assert.equal(await repo.desfavoritar('atend-inexistente', 'p1'), 'ausente');
  assert.equal(await repo.obterFavoritos('atend-inexistente', 'p1'), undefined);

  // Existente
  assert.equal(await repo.favoritar('atend-1', 'p1'), 'ok');
  assert.equal(
    consultas.some((c) => c.sql.includes('INSERT INTO hq_favorito')),
    true
  );

  assert.equal(await repo.desfavoritar('atend-1', 'p1'), 'ok');
  assert.equal(
    consultas.some((c) => c.sql.includes('DELETE FROM hq_favorito')),
    true
  );

  const favInfo = await repo.obterFavoritos('atend-1', 'perfil-1');
  assert.ok(favInfo);
  assert.equal(favInfo.favoritadoPeloUsuario, true);
  assert.equal(favInfo.favoritos.count, 1);
  assert.deepEqual(favInfo.favoritos.perfis, [{ id: 'perfil-1', nome: 'Curador 1' }]);
});

test('renderização do estado de favorito no detalhe e conferência humana', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const detalhe = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/DetalheAtendimento.tsx'),
    'utf8'
  );
  const botao = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/BotaoFavorito.tsx'),
    'utf8'
  );
  const badge = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/BadgeFavoritos.tsx'),
    'utf8'
  );

  // 1. BotaoFavorito alterna entre preenchida e contorno e possui feedback
  assert.match(botao, /favoritado \? '★' : '☆'/);
  assert.match(botao, /botao-favorito/);
  assert.match(botao, /is-favorito/);
  assert.match(botao, /aria-pressed=\{favoritado\}/);
  assert.match(botao, /favoritarAtendimento/);
  assert.match(botao, /desfavoritarAtendimento/);

  // 2. BadgeFavoritos para Admin e Gestão exibe ★ N e tooltip com nomes dos curadores
  assert.match(badge, /badge-favoritos/);
  assert.match(badge, /★/);
  assert.match(badge, /badge-favoritos-tooltip/);
  assert.match(badge, /is-ativo/);
  assert.match(badge, /is-vazio/);

  // 3. DetalheAtendimento exibe BotaoFavorito para Curador e BadgeFavoritos para Gestão/Admin
  assert.match(
    detalhe,
    /perfil\.papel === 'Curador' \?\s*\(\s*<BotaoFavorito[\s\S]*?\/>\s*\)\s*:\s*\(\s*<BadgeFavoritos[\s\S]*?\/>\s*\)/
  );
  assert.match(detalhe, /<dt>Favorito<\/dt>/);

  // 4. FormularioConferencia permite favoritar e desfavoritar durante o preenchimento da revisão
  assert.match(detalhe, /<form className="conferencia-form"[\s\S]*<BotaoFavorito/);
});
