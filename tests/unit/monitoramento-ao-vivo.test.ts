import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import {
  areasDaCasca,
  destinoDaNavegacao,
  tituloDaPagina
} from '../../packages/contracts/src/casca.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { destinoDaLista } from '../../packages/contracts/src/recorte.js';
import {
  monitoramentoListagemResponseSchema,
  monitoramentoDetalheSchema
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

test('casca diz Ao vivo e o h1 é Monitoramento ao Vivo', () => {
  for (const papel of ['Admin', 'Gestão', 'Curador'] as const) {
    const area = areasDaCasca(papel).find((item) => item.rota === '/monitoramento');
    assert.equal(area?.rotulo, 'Ao vivo');
    assert.equal(area?.titulo, 'Monitoramento ao Vivo');
    assert.equal(tituloDaPagina('/monitoramento', papel), 'Monitoramento ao Vivo');
    assert.equal(
      tituloDaPagina('/monitoramento/a4', papel),
      'Monitoramento ao Vivo'
    );
  }
});

test('copy da casca não usa supervisão', () => {
  const textos = (['Admin', 'Gestão', 'Curador'] as const).flatMap((papel) =>
    areasDaCasca(papel).flatMap((area) => [area.rotulo, area.titulo])
  );

  for (const texto of textos) {
    assert.equal(/supervis/i.test(texto), false);
  }
});

test('voltar ao Monitoramento ao Vivo preserva Recorte na URL', () => {
  assert.equal(
    destinoDaLista(
      { administradora: 'Affix', agente: 'affix-wa' },
      '/monitoramento'
    ),
    '/monitoramento?administradora=Affix&agente=affix-wa'
  );
});

test('deep link ao vivo permanece na área liberada', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Curador' },
      pathname: '/monitoramento/a4'
    }),
    '/monitoramento/a4'
  );
});

test('GET /monitoramento sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/monitoramento' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('recurso ao vivo autentica qualquer Perfil', async () => {
  const app = await buildApp();

  try {
    for (const email of [
      'ana.souza@crion',
      'bruno.alves@crion',
      'carla.mendes@crion'
    ]) {
      const sessao = await sessaoDe(app, email);
      const response = await app.inject({
        method: 'GET',
        url: '/monitoramento',
        headers: { authorization: `Bearer ${sessao}` }
      });

      assert.equal(response.statusCode, 200);
      const bruto = response.json() as { itens: Array<Record<string, unknown>> };
      assert.ok(bruto.itens.length > 0);
      for (const item of bruto.itens) {
        assert.equal(item.status, 'Em andamento');
        assert.equal('nota' in item, false);
        assert.equal('custo' in item, false);
        assert.equal('curadoria' in item, false);
        assert.equal('audio' in item, false);
      }
      monitoramentoListagemResponseSchema.parse(bruto);
    }
  } finally {
    await app.close();
  }
});

test('Recorte filtra a lista ao vivo', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const consolidada = await app.inject({
      method: 'GET',
      url: '/monitoramento',
      headers
    });
    const recortada = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix&agente=affix-wa',
      headers
    });
    const outroAgente = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix&agente=affix-0800',
      headers
    });

    assert.equal(consolidada.statusCode, 200);
    assert.equal(recortada.statusCode, 200);
    const bruto = recortada.json() as { itens: Array<Record<string, unknown>> };
    for (const item of bruto.itens) {
      assert.equal('nota' in item, false);
      assert.equal('custo' in item, false);
    }
    const lista = monitoramentoListagemResponseSchema.parse(bruto);
    assert.deepEqual(lista.recorte, {
      administradora: 'Affix',
      agente: 'affix-wa'
    });
    assert.ok(lista.itens.length > 0);
    for (const item of lista.itens) {
      assert.equal(item.administradora, 'Affix');
      assert.equal(item.agenteId, 'affix-wa');
      assert.equal(item.status, 'Em andamento');
    }
    assert.equal(outroAgente.statusCode, 200);
    assert.equal(monitoramentoListagemResponseSchema.parse(outroAgente.json()).itens.length, 0);
    assert.ok(
      monitoramentoListagemResponseSchema.parse(consolidada.json()).itens.length >= lista.itens.length
    );
  } finally {
    await app.close();
  }
});

test('Monitoramento ao Vivo ignora período da listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento?inicio=2020-01-01&fim=2020-01-31',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = monitoramentoListagemResponseSchema
      .parse(response.json())
      .itens.map((item) => item.id);
    assert.ok(ids.includes('a4'));
  } finally {
    await app.close();
  }
});

test('GET /monitoramento rejeita par Administradora + Agente inválido', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('GET /monitoramento/:id sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/monitoramento/a4' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('detalhe ao vivo é observacional: texto, sem áudio e sem ação no contato', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento/a4',
      headers
    });
    const conferencia = await app.inject({
      method: 'POST',
      url: '/monitoramento/a4/conferencia',
      headers,
      payload: { checklist: [], notaDaRegua: 8, notaDaAvaliacaoDaIa: 8 }
    });

    assert.equal(response.statusCode, 200);
    const bruto = response.json() as Record<string, unknown>;
    assert.equal('conversa' in bruto, false);
    assert.equal('audio' in bruto, false);
    assert.equal('downloadDeAudio' in bruto, false);
    assert.equal('avaliacaoDaIa' in bruto, false);
    assert.equal('avaliacaoDoCurador' in bruto, false);
    const body = monitoramentoDetalheSchema.parse(bruto);
    assert.equal(body.status, 'Em andamento');
    assert.ok(body.transcricao.length > 0);
    assert.notEqual(conferencia.statusCode, 200);
  } finally {
    await app.close();
  }
});

test('detalhe ao vivo recusa Atendimento já concluído', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});
