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

test('consultas de listagem enriquecem itens com favoritadoPeloUsuario, favoritosCount e favoritosPerfis', async () => {
  const { listagemResponseSchema } = await import(
    '../../packages/contracts/src/atendimento.js'
  );
  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    // Carla favorita atendimento a1
    const favRes = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(favRes.statusCode, 200);

    // 1. Curador em /atendimentos
    const listCurador = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(listCurador.statusCode, 200);
    const dadosCurador = listagemResponseSchema.parse(listCurador.json());
    const itemA1Curador = dadosCurador.itens.find((it) => it.id === 'a1');
    assert.ok(itemA1Curador);
    assert.equal(itemA1Curador.favoritadoPeloUsuario, true);
    assert.equal(itemA1Curador.favoritosCount, 1);
    assert.deepEqual(itemA1Curador.favoritosPerfis, ['Carla Mendes']);

    // 2. Admin em /atendimentos
    const listAdmin = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(listAdmin.statusCode, 200);
    const dadosAdmin = listagemResponseSchema.parse(listAdmin.json());
    const itemA1Admin = dadosAdmin.itens.find((it) => it.id === 'a1');
    assert.ok(itemA1Admin);
    assert.equal(itemA1Admin.favoritadoPeloUsuario, false);
    assert.equal(itemA1Admin.favoritosCount, 1);
    assert.deepEqual(itemA1Admin.favoritosPerfis, ['Carla Mendes']);

    // 3. Gestão em /atendimentos
    const listGestao = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(listGestao.statusCode, 200);
    const dadosGestao = listagemResponseSchema.parse(listGestao.json());
    const itemA1Gestao = dadosGestao.itens.find((it) => it.id === 'a1');
    assert.ok(itemA1Gestao);
    assert.equal(itemA1Gestao.favoritadoPeloUsuario, false);
    assert.equal(itemA1Gestao.favoritosCount, 1);
    assert.deepEqual(itemA1Gestao.favoritosPerfis, ['Carla Mendes']);

    // 4. Curador em /fila-de-curadoria
    const listFilaCurador = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(listFilaCurador.statusCode, 200);
    const dadosFila = listagemResponseSchema.parse(listFilaCurador.json());
    for (const item of dadosFila.itens) {
      assert.equal(typeof item.favoritadoPeloUsuario, 'boolean');
      assert.equal(typeof item.favoritosCount, 'number');
      assert.ok(Array.isArray(item.favoritosPerfis));
    }

    // 5. Admin em /curadorias-realizadas
    const listRealizadas = await app.inject({
      method: 'GET',
      url: '/curadorias-realizadas',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(listRealizadas.statusCode, 200);
    const dadosRealizadas = listagemResponseSchema.parse(listRealizadas.json());
    for (const item of dadosRealizadas.itens) {
      assert.equal(typeof item.favoritadoPeloUsuario, 'boolean');
      assert.equal(typeof item.favoritosCount, 'number');
      assert.ok(Array.isArray(item.favoritosPerfis));
    }

    // 6. Item não favoritado (ex: a2) tem contagem 0 e favoritadoPeloUsuario false
    const itemA2 = dadosCurador.itens.find((it) => it.id === 'a2');
    if (itemA2) {
      assert.equal(itemA2.favoritadoPeloUsuario, false);
      assert.equal(itemA2.favoritosCount, 0);
      assert.deepEqual(itemA2.favoritosPerfis, []);
    }
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

  // consultarListagem repassa perfilId para a query SQL com join/subselect de hq_favorito
  consultas.length = 0;
  await repo.consultarListagem(
    { administradora: null, agente: null },
    {},
    'todos',
    'perfil-curador-123'
  );
  const consultaListagem = consultas.find((c) =>
    c.sql.includes('FROM hq_atendimento') && c.sql.includes('hq_favorito')
  );
  assert.ok(consultaListagem, 'Query de listagem deve incluir subselect com hq_favorito');
  assert.equal(
    consultaListagem.valores?.[7],
    'perfil-curador-123',
    'perfilId deve ser repassado como parâmetro $8'
  );

  // consultarFavoritos para Curador e para Admin/Gestão no repositório Postgres
  consultas.length = 0;
  await repo.consultarFavoritos(
    { administradora: 'Affix', agente: null },
    { conversa: 'a1' },
    { id: 'perfil-curador-1', papel: 'Curador' }
  );
  const consultaFavCurador = consultas.find((c) =>
    c.sql.includes('FROM hq_favorito meu_fav')
  );
  assert.ok(consultaFavCurador, 'Query de favoritos do Curador deve consultar meu_fav');
  assert.equal(consultaFavCurador.valores?.[0], 'perfil-curador-1');

  consultas.length = 0;
  await repo.consultarFavoritos(
    { administradora: null, agente: null },
    { curador: 'perfil-curador-2' },
    { id: 'perfil-admin-1', papel: 'Admin' }
  );
  const consultaFavAdmin = consultas.find((c) =>
    c.sql.includes('MAX(favoritado_em)')
  );
  assert.ok(consultaFavAdmin, 'Query de favoritos de Admin deve agrupar por MAX(favoritado_em)');
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

  // 4. FavoritosPage inclui RecorteCascata, BadgeAdministradora, BotaoFavorito para Curador e BadgeFavoritos para Admin/Gestao
  const favoritosPage = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FavoritosPage.tsx'),
    'utf8'
  );
  assert.match(favoritosPage, /RecorteCascata/);
  assert.match(favoritosPage, /BadgeAdministradora/);
  assert.match(favoritosPage, /BarraDeFiltrosDaListagem/);
  assert.match(favoritosPage, /perfil\.papel === 'Curador'/);
  assert.match(favoritosPage, /aoDesfavoritar/);
  assert.match(favoritosPage, /BotaoFavorito/);
  assert.match(favoritosPage, /BadgeFavoritos/);

  // 4. FormularioConferencia permite favoritar e desfavoritar durante o preenchimento da revisão
  assert.match(detalhe, /<form className="conferencia-form"[\s\S]*<BotaoFavorito/);

  // 5. ListagemAtendimentos exibe BotaoFavorito para Curador e BadgeFavoritos para Gestão/Admin
  const listagem = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/ListagemAtendimentos.tsx'),
    'utf8'
  );
  assert.match(
    listagem,
    /perfil\.papel === 'Curador' \?\s*\(\s*<BotaoFavorito[\s\S]*?\/>\s*\)\s*:\s*\(\s*<BadgeFavoritos[\s\S]*?\/>\s*\)/
  );

  // 6. MonitoramentoPage e DetalheMonitoramento exibem BotaoFavorito desabilitado se não persistido
  const monitoramentoLista = readFileSync(
    join(raiz, 'apps/web/src/features/monitoramento/MonitoramentoPage.tsx'),
    'utf8'
  );
  assert.match(monitoramentoLista, /disabled=\{!item\.persistidoNoHq\}/);
  assert.match(monitoramentoLista, /perfil\.papel === 'Curador'/);

  const monitoramentoDetalhe = readFileSync(
    join(raiz, 'apps/web/src/features/monitoramento/DetalheMonitoramento.tsx'),
    'utf8'
  );
  assert.match(monitoramentoDetalhe, /disabled=\{!atendimento\.persistidoNoHq\}/);
  assert.match(monitoramentoDetalhe, /perfil\.papel === 'Curador'/);
});

test('Monitoramento ao Vivo atribui persistidoNoHq e desabilita preventivamente favoritos de atendimentos não persistidos', async () => {
  const { monitoramentoDetalheSchema, monitoramentoListagemResponseSchema } = await import(
    '../../packages/contracts/src/atendimento.js'
  );

  const agoraUnix = Math.floor(Date.now() / 1000);
  const conversasAoVivo = [
    {
      conversation_id: 'conv-nova-ao-vivo',
      agent_id: 'affix-wa',
      agent_name: 'Clara Affix WhatsApp',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [
        { role: 'agent', message: 'Estou na linha.', time_in_call_secs: 1 }
      ]
    }
  ];

  let inicializado = false;
  const originalFetch = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const id = url.match(/\/conversations\/([^/?]+)/)?.[1];

    if (id) {
      const encontrada = conversasAoVivo.find((item) => item.conversation_id === id);
      return new Response(JSON.stringify(encontrada ?? {}), {
        status: encontrada ? 200 : 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Na inicialização (coletarDaFonte), simula que não coletou conv-nova-ao-vivo
    if (!inicializado) {
      return new Response(JSON.stringify({ conversations: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ conversations: conversasAoVivo }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  const app = await buildApp();
  inicializado = true;

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    // 1. GET /monitoramento lista abertos e indica persistidoNoHq: false
    const resLista = await app.inject({
      method: 'GET',
      url: '/monitoramento',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resLista.statusCode, 200, resLista.body);
    const lista = monitoramentoListagemResponseSchema.parse(resLista.json());
    const itemAberto = lista.itens.find((it) => it.id === 'conv-nova-ao-vivo');
    assert.ok(itemAberto);
    assert.equal(itemAberto.persistidoNoHq, false);
    assert.equal(itemAberto.favoritadoPeloUsuario, false);

    // 2. GET /monitoramento/:id detalhe indica persistidoNoHq: false para não persistido
    const resDetalhe = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-nova-ao-vivo',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resDetalhe.statusCode, 200);
    const detalheNaoPersistido = monitoramentoDetalheSchema.parse(resDetalhe.json());
    assert.equal(detalheNaoPersistido.persistidoNoHq, false);
    assert.equal(detalheNaoPersistido.favoritadoPeloUsuario, false);

    // 3. Tentar favoritar diretamente atendimento não persistido retorna 404
    const postFavNaoPersistido = await app.inject({
      method: 'POST',
      url: '/atendimentos/conv-nova-ao-vivo/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(postFavNaoPersistido.statusCode, 404);

    // 4. Agora simula que o atendimento foi persistido no banco do HQ (ex: via ingestão/job)
    const repo = app.atendimentos;
    const listaAtual = await repo.listar();
    const mockAtendimento = {
      ...listaAtual[0]!,
      id: 'conv-nova-ao-vivo',
      conversa: 'conv-nova-ao-vivo',
      status: 'Em andamento'
    };
    (listaAtual as any[]).push(mockAtendimento);

    // Agora GET /monitoramento/conv-nova-ao-vivo deve devolver persistidoNoHq: true
    const resDetalhePersistido = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-nova-ao-vivo',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resDetalhePersistido.statusCode, 200);
    const detalhePersistido = monitoramentoDetalheSchema.parse(resDetalhePersistido.json());
    assert.equal(detalhePersistido.persistidoNoHq, true);

    // E Curador agora pode favoritar 'conv-nova-ao-vivo' com sucesso
    const postFav = await app.inject({
      method: 'POST',
      url: '/atendimentos/conv-nova-ao-vivo/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(postFav.statusCode, 200);

    // Detalhe ao vivo reflete que foi favoritado
    const resDetalheFavoritado = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-nova-ao-vivo',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resDetalheFavoritado.statusCode, 200);
    const detalheFavoritado = monitoramentoDetalheSchema.parse(resDetalheFavoritado.json());
    assert.equal(detalheFavoritado.persistidoNoHq, true);
    assert.equal(detalheFavoritado.favoritadoPeloUsuario, true);

    // E desfavoritar também funciona
    const delFav = await app.inject({
      method: 'DELETE',
      url: '/atendimentos/conv-nova-ao-vivo/favorito',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(delFav.statusCode, 200);

    const resDetalheDesfavoritado = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-nova-ao-vivo',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(resDetalheDesfavoritado.statusCode, 200);
    const detalheDesfavoritado = monitoramentoDetalheSchema.parse(resDetalheDesfavoritado.json());
    assert.equal(detalheDesfavoritado.favoritadoPeloUsuario, false);
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = originalFetch;
  }
});

test('GET /favoritos suporta os três papéis, recorte, busca conversa, filtro perfilId, paginação e perfil inativo', async () => {
  const { listagemResponseSchema } = await import(
    '../../packages/contracts/src/atendimento.js'
  );
  const { criarPerfil, definirAtivo } = await import(
    '../../apps/api/src/modules/perfil/repositorio.js'
  );

  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCuradorCarla = await sessaoDe(app, 'carla.mendes@crion');

    // 1. GET /favoritos sem sessão -> 401
    const resSemAuth = await app.inject({
      method: 'GET',
      url: '/favoritos'
    });
    assert.equal(resSemAuth.statusCode, 401);

    // 2. Criar segundo curador para testar consolidação e perfil inativo
    const curador2 = await criarPerfil({
      nome: 'Curador Secundario',
      email: 'curador2@crion',
      papel: 'Curador',
      senha: 'crion-hq'
    });
    const sessaoCurador2 = await sessaoDe(app, 'curador2@crion');

    // Carla favorita a1
    await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/favorito',
      headers: { authorization: `Bearer ${sessaoCuradorCarla}` }
    });
    // Aguardar pequena fração de ms para garantir carimbos distintos
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Carla favorita a2
    await app.inject({
      method: 'POST',
      url: '/atendimentos/a2/favorito',
      headers: { authorization: `Bearer ${sessaoCuradorCarla}` }
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Curador 2 favorita a2
    await app.inject({
      method: 'POST',
      url: '/atendimentos/a2/favorito',
      headers: { authorization: `Bearer ${sessaoCurador2}` }
    });

    // 3. Teste para papel Curador:
    // Retorna apenas os favoritados pelo usuário logado, ordenados pelo seu favoritado_em DESC
    const resCurador2 = await app.inject({
      method: 'GET',
      url: '/favoritos',
      headers: { authorization: `Bearer ${sessaoCurador2}` }
    });
    assert.equal(resCurador2.statusCode, 200);
    const dadosCurador2 = listagemResponseSchema.parse(resCurador2.json());
    assert.equal(dadosCurador2.itens.length, 1);
    assert.equal(dadosCurador2.itens[0].id, 'a2');
    assert.equal(dadosCurador2.itens[0].favoritadoPeloUsuario, true);

    const resCarla = await app.inject({
      method: 'GET',
      url: '/favoritos',
      headers: { authorization: `Bearer ${sessaoCuradorCarla}` }
    });
    assert.equal(resCarla.statusCode, 200);
    const dadosCarla = listagemResponseSchema.parse(resCarla.json());
    assert.equal(dadosCarla.itens.length, 2);
    // a2 foi favoritado depois de a1, então ordem DESC coloca a2 antes de a1
    assert.equal(dadosCarla.itens[0].id, 'a2');
    assert.equal(dadosCarla.itens[1].id, 'a1');

    // 4. Teste para papel Admin e Gestão:
    // Retorna lista consolidada deduplicada ordenada por MAX(favoritado_em) DESC
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/favoritos',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resAdmin.statusCode, 200);
    const dadosAdmin = listagemResponseSchema.parse(resAdmin.json());
    assert.equal(dadosAdmin.itens.length, 2);
    assert.equal(dadosAdmin.itens[0].id, 'a2'); // max favoritado_em é mais recente
    assert.equal(dadosAdmin.itens[0].favoritosCount, 2);
    assert.ok(dadosAdmin.itens[0].favoritosPerfis?.includes('Carla Mendes'));
    assert.ok(dadosAdmin.itens[0].favoritosPerfis?.includes('Curador Secundario'));
    assert.equal(dadosAdmin.itens[1].id, 'a1');
    assert.equal(dadosAdmin.itens[1].favoritosCount, 1);

    // Gestão também vê a mesma visão consolidada
    const resGestao = await app.inject({
      method: 'GET',
      url: '/favoritos',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(resGestao.statusCode, 200);
    const dadosGestao = listagemResponseSchema.parse(resGestao.json());
    assert.equal(dadosGestao.itens.length, 2);

    // 5. Filtro por busca de conversa (id da conversa)
    const resBusca = await app.inject({
      method: 'GET',
      url: '/favoritos?conversa=a1',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resBusca.statusCode, 200);
    const dadosBusca = listagemResponseSchema.parse(resBusca.json());
    assert.equal(dadosBusca.itens.length, 1);
    assert.equal(dadosBusca.itens[0].id, 'a1');

    // 6. Filtro por perfilId do curador (somente Admin/Gestão)
    const resFiltroCurador = await app.inject({
      method: 'GET',
      url: `/favoritos?perfilId=${curador2.id}`,
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resFiltroCurador.statusCode, 200);
    const dadosFiltro = listagemResponseSchema.parse(resFiltroCurador.json());
    assert.equal(dadosFiltro.itens.length, 1);
    assert.equal(dadosFiltro.itens[0].id, 'a2');

    // 7. Desativar perfil do Curador Secundario: marcações permanecem no histórico
    await definirAtivo(curador2.id, false);

    const resAposDesativar = await app.inject({
      method: 'GET',
      url: '/favoritos',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resAposDesativar.statusCode, 200);
    const dadosAposDesativar = listagemResponseSchema.parse(resAposDesativar.json());
    const itemA2Apos = dadosAposDesativar.itens.find((it) => it.id === 'a2');
    assert.ok(itemA2Apos);
    assert.equal(itemA2Apos.favoritosCount, 2);
    assert.ok(itemA2Apos.favoritosPerfis?.includes('Curador Secundario'));

    // 8. Recorte em cascata e par inválido
    const resRecorteInvalido = await app.inject({
      method: 'GET',
      url: '/favoritos?administradora=Affix&agente=agente-inexistente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resRecorteInvalido.statusCode, 400);

    // Recorte válido
    const resRecorteValido = await app.inject({
      method: 'GET',
      url: '/favoritos?administradora=Alter',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resRecorteValido.statusCode, 200);

    // 9. Paginação padrão (50 por página) e navegação
    const resPagina1 = await app.inject({
      method: 'GET',
      url: '/favoritos?pagina=1',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resPagina1.statusCode, 200);
    const dadosPagina1 = listagemResponseSchema.parse(resPagina1.json());
    assert.equal(dadosPagina1.pagina, 1);
    assert.equal(dadosPagina1.tamanho, 50);

    const resPagina2 = await app.inject({
      method: 'GET',
      url: '/favoritos?pagina=2',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(resPagina2.statusCode, 200);
    const dadosPagina2 = listagemResponseSchema.parse(resPagina2.json());
    // Como há 2 itens no total, a página 2 fica limitada na última página
    assert.equal(dadosPagina2.pagina, 1);
  } finally {
    await app.close();
  }
});
