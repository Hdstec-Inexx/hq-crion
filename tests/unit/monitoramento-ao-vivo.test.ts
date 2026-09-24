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

type ConversaDaFonte = {
  conversation_id: string;
  agent_id: string;
  agent_name?: string;
  status?: string;
  start_time_unix_secs?: number;
  transcript?: { role: string; message: string; time_in_call_secs?: number }[];
};

const agoraUnix = Math.floor(Date.now() / 1000);

function conversasDaFonte(): ConversaDaFonte[] {
  return [
    {
      conversation_id: 'conv-aberta',
      agent_id: 'affix-wa',
      agent_name: 'Clara Affix WhatsApp',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [
        { role: 'agent', message: 'Estou na linha.', time_in_call_secs: 1 },
        { role: 'user', message: 'Ainda estou aqui.', time_in_call_secs: 4 }
      ]
    },
    {
      conversation_id: 'conv-antiga',
      agent_id: 'affix-wa',
      agent_name: 'Clara Affix WhatsApp',
      status: 'in-progress',
      start_time_unix_secs: Date.parse('2020-01-15T10:00:00-03:00') / 1000,
      transcript: [{ role: 'user', message: 'Contato de janeiro.', time_in_call_secs: 2 }]
    },
    {
      conversation_id: 'conv-outro-agente',
      agent_id: 'affix-0800',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Outro agente.', time_in_call_secs: 1 }]
    },
    {
      conversation_id: 'conv-zumbi',
      agent_id: 'alter-1',
      status: 'processing',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Presa na fonte.', time_in_call_secs: 1 }]
    },
    {
      conversation_id: 'a1',
      agent_id: 'affix-0800',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Já concluído no HQ.', time_in_call_secs: 1 }]
    },
    {
      conversation_id: 'conv-done',
      agent_id: 'conecta-1',
      status: 'done',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Encerrada.', time_in_call_secs: 1 }]
    }
  ];
}

async function comFonte(
  executar: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>,
  conversas = conversasDaFonte()
) {
  const fetchOriginal = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const id = url.match(/\/conversations\/([^/?]+)/)?.[1];

    if (id) {
      const encontrada = conversas.find((item) => item.conversation_id === id);

      return new Response(JSON.stringify(encontrada ?? {}), {
        status: encontrada ? 200 : 404,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ conversations: conversas }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  const app = await buildApp();

  try {
    await executar(app);
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = fetchOriginal;
  }
}

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

test('recurso ao vivo autentica qualquer Perfil e lista só o aberto na fonte', async () => {
  await comFonte(async (app) => {
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

      assert.equal(response.statusCode, 200, response.body);
      const bruto = response.json() as { itens: Array<Record<string, unknown>> };
      const ids = bruto.itens.map((item) => item.id);
      assert.ok(ids.includes('conv-aberta'));
      assert.ok(ids.includes('conv-antiga'));
      assert.equal(ids.includes('conv-zumbi'), false);
      assert.equal(ids.includes('a1'), false);
      assert.equal(ids.includes('conv-done'), false);
      assert.equal(ids.includes('a4'), false);
      for (const item of bruto.itens) {
        assert.equal(item.status, 'Em andamento');
        assert.equal('nota' in item, false);
        assert.equal('custo' in item, false);
        assert.equal('curadoria' in item, false);
        assert.equal('audio' in item, false);
      }
      monitoramentoListagemResponseSchema.parse(bruto);
    }
  });
});

test('Recorte filtra a lista ao vivo', async () => {
  await comFonte(async (app) => {
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
    const idsDoOutro = monitoramentoListagemResponseSchema
      .parse(outroAgente.json())
      .itens.map((item) => item.id);
    assert.deepEqual(idsDoOutro, ['conv-outro-agente']);
    assert.ok(
      monitoramentoListagemResponseSchema.parse(consolidada.json()).itens.length >= lista.itens.length
    );
  });
});

test('Monitoramento ao Vivo ignora o mês civil', async () => {
  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento?inicio=2020-01-01&fim=2020-01-31',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200, response.body);
    const ids = monitoramentoListagemResponseSchema
      .parse(response.json())
      .itens.map((item) => item.id);
    assert.ok(ids.includes('conv-antiga'));
    assert.ok(ids.includes('conv-aberta'));
  });
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

test('detalhe ao vivo é texto da fonte e não altera o Atendimento', async () => {
  const conversas = conversasDaFonte();
  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const antes = await app.inject({
      method: 'GET',
      url: '/atendimentos/conv-aberta',
      headers
    });
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-aberta',
      headers
    });
    const conferencia = await app.inject({
      method: 'POST',
      url: '/monitoramento/conv-aberta/conferencia',
      headers,
      payload: { checklist: [], notaDaRegua: 8, notaDaAvaliacaoDaIa: 8 }
    });
    const depois = await app.inject({
      method: 'GET',
      url: '/atendimentos/conv-aberta',
      headers
    });

    assert.equal(response.statusCode, 200, response.body);
    const bruto = response.json() as Record<string, unknown>;
    assert.equal('conversa' in bruto, false);
    assert.equal('audio' in bruto, false);
    assert.equal('downloadDeAudio' in bruto, false);
    assert.equal('avaliacaoDaIa' in bruto, false);
    assert.equal('avaliacaoDoCurador' in bruto, false);
    const body = monitoramentoDetalheSchema.parse(bruto);
    assert.equal(body.status, 'Em andamento');
    assert.equal(body.transcricao[1]?.texto, 'Ainda estou aqui.');
    assert.notEqual(conferencia.statusCode, 200);
    assert.equal(depois.statusCode, antes.statusCode);
    assert.equal(depois.body, antes.body);
  }, conversas);

  conversas[0] = {
    ...conversas[0],
    transcript: [
      { role: 'agent', message: 'Estou na linha.', time_in_call_secs: 1 },
      { role: 'user', message: 'Texto novo da fonte.', time_in_call_secs: 8 }
    ]
  };

  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const atualizado = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-aberta',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(atualizado.statusCode, 200, atualizado.body);
    assert.equal(
      monitoramentoDetalheSchema.parse(atualizado.json()).transcricao[1]?.texto,
      'Texto novo da fonte.'
    );
  }, conversas);
});

test('detalhe ao vivo deixa de fora zumbi e Atendimento já Concluído', async () => {
  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const zumbi = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-zumbi',
      headers
    });
    const concluido = await app.inject({
      method: 'GET',
      url: '/monitoramento/a1',
      headers
    });

    assert.equal(zumbi.statusCode, 404);
    assert.equal(concluido.statusCode, 404);
  });
});
