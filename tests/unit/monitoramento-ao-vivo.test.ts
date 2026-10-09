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
  monitoramentoDetalheSchema,
  type TurnoDaTranscricao
} from '../../packages/contracts/src/atendimento.js';
import {
  consultaDaListaAoVivo,
  destinoDaFalhaInicial,
  mensagemDaListaAoVivo,
  aplicarCargaDaLista,
  deveBuscarDeNovo,
  devePulsar,
  esperaDoPulso,
  intervaloDoPulsoMs,
  normalizarListagemAoVivo,
  reduzirCargaAoVivo,
  textoDaLinhaAoVivo
} from '../../apps/web/src/features/monitoramento/pulso.js';
import {
  acompanhaOFim,
  aplicarEventoDaObservacao,
  avisoDaTranscricao,
  observarTranscricao,
  textoDaObservacao
} from '../../apps/web/src/features/monitoramento/observacao.js';
import { listarConversasElevenLabs } from '../../apps/api/src/modules/ingestao/elevenlabs.js';
import {
  eventoDaMensagemDaFonte,
  sessaoDaMensagem,
  urlDoMonitorDaFonte
} from '../../apps/api/src/modules/monitoramento/canal.js';
import { createMonitoramentoProxy } from '../../apps/api/src/modules/monitoramento/proxy.js';

process.env.NODE_ENV = 'test';

type ConversaDaFonte = {
  conversation_id: string;
  agent_id: string;
  agent_name?: string;
  status?: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  termination_reason?: string;
  call_successful?: string;
  metadata?: { start_time_unix_secs?: number };
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
      conversation_id: 'conv-encerrada',
      agent_id: 'affix-wa',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix - 120,
      call_duration_secs: 30,
      termination_reason: 'end_call',
      transcript: [{ role: 'agent', message: 'Tchau.', time_in_call_secs: 30 }]
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
      assert.equal(ids.includes('conv-antiga'), false);
      assert.equal(ids.includes('conv-zumbi'), false);
      assert.equal(ids.includes('a1'), false);
      assert.equal(ids.includes('conv-done'), false);
      assert.equal(ids.includes('conv-encerrada'), false);
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
    assert.equal(ids.includes('conv-antiga'), false);
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
      payload: { checklist: [] }
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

test('agente fora do catálogo entra na leitura consolidada e no Recorte do nome', async () => {
  await comFonte(
    async (app) => {
      const sessao = await sessaoDe(app, 'ana.souza@crion');
      const headers = { authorization: `Bearer ${sessao}` };
      const todas = await app.inject({ method: 'GET', url: '/monitoramento', headers });
      const ids = monitoramentoListagemResponseSchema
        .parse(todas.json())
        .itens.map((item) => item.id);
      const alter = await app.inject({
        method: 'GET',
        url: '/monitoramento?administradora=Alter',
        headers
      });
      const idsAlter = monitoramentoListagemResponseSchema
        .parse(alter.json())
        .itens.map((item) => item.id);

      assert.equal(todas.statusCode, 200, todas.body);
      assert.ok(ids.includes('conv_8501m3mwt29ceb18b55d68zgg6z'));
      assert.ok(ids.includes('conv_0901m3mjtxhevna7kq1bhwfhgfp'));
      assert.ok(idsAlter.includes('conv_8501m3mwt29ceb18b55d68zgg6z'));
      assert.ok(idsAlter.includes('conv_0901m3mjtxhevna7kq1bhwfhgfp'));
    },
    [
      {
        conversation_id: 'conv_8501m3mwt29ceb18b55d68zgg6z',
        agent_id: 'agent_3701kr451qfdevqy90mp8p2qrxz',
        agent_name: 'Clara - Roteador | Alter',
        status: 'in-progress',
        start_time_unix_secs: agoraUnix
      },
      {
        conversation_id: 'conv_0901m3mjtxhevna7kq1bhwfhgfp',
        agent_id: 'agent_7001k5y7pf7fxrvp074j6s4wx5m',
        agent_name: 'Clara Retencao Alter',
        status: 'in-progress',
        start_time_unix_secs: agoraUnix
      }
    ]
  );
});

test('leitura consolidada inclui o aberto fora do catálogo e o Recorte esconde', async () => {
  const conversas = conversasDaFonte();
  conversas.push(
    {
      conversation_id: 'conv-fora',
      agent_id: 'agente-fora-do-catalogo',
      agent_name: 'Clara de outra operação',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Fora do catálogo.', time_in_call_secs: 1 }]
    },
    {
      conversation_id: 'conv-sem-nome',
      agent_id: 'id-sem-nome',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix
    },
    {
      conversation_id: 'conv-nome-affix',
      agent_id: 'el-affix-real',
      agent_name: 'Clara Affix WhatsApp',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Pelo nome.', time_in_call_secs: 1 }]
    },
    {
      conversation_id: 'conv-nome-alter',
      agent_id: 'el-alter-real',
      agent_name: 'Clara Alter Plantão',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix,
      transcript: [{ role: 'agent', message: 'Outra administradora.', time_in_call_secs: 1 }]
    }
  );

  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const todas = await app.inject({ method: 'GET', url: '/monitoramento', headers });
    const corpo = monitoramentoListagemResponseSchema.parse(todas.json());
    const fora = corpo.itens.find((item) => item.id === 'conv-fora');
    const semNome = corpo.itens.find((item) => item.id === 'conv-sem-nome');

    assert.equal(todas.statusCode, 200, todas.body);
    assert.equal(corpo.fonteConfigurada, true);
    assert.ok(fora);
    assert.equal(fora?.administradora, null);
    assert.equal(fora?.agente, 'Clara de outra operação');
    assert.equal(fora?.agenteId, 'agente-fora-do-catalogo');
    assert.ok(semNome);
    assert.equal(semNome?.administradora, null);
    assert.equal(semNome?.agente, 'id-sem-nome');
    const peloNome = corpo.itens.find((item) => item.id === 'conv-nome-affix');
    const alterPeloNome = corpo.itens.find((item) => item.id === 'conv-nome-alter');
    assert.equal(peloNome?.administradora, null);
    assert.equal(peloNome?.agenteId, 'el-affix-real');
    assert.equal(alterPeloNome?.administradora, null);
    assert.equal(corpo.itens.some((item) => item.id === 'a1'), false);
    assert.equal(corpo.itens.some((item) => item.id === 'conv-zumbi'), false);
    assert.equal(corpo.itens.some((item) => item.id === 'conv-done'), false);

    const porAdministradora = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix',
      headers
    });
    const idsAffix = monitoramentoListagemResponseSchema
      .parse(porAdministradora.json())
      .itens.map((item) => item.id);
    assert.equal(idsAffix.includes('conv-fora'), false);
    assert.equal(idsAffix.includes('conv-sem-nome'), false);
    assert.equal(idsAffix.includes('conv-nome-alter'), false);
    assert.ok(idsAffix.includes('conv-aberta'));
    assert.ok(idsAffix.includes('conv-nome-affix'));
    assert.equal(idsAffix.includes('conv-outro-agente'), true);

    const porAgente = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix&agente=affix-wa',
      headers
    });
    const idsAgente = monitoramentoListagemResponseSchema
      .parse(porAgente.json())
      .itens.map((item) => item.id);
    assert.equal(idsAgente.includes('conv-outro-agente'), false);
    assert.equal(idsAgente.includes('conv-fora'), false);
    assert.equal(idsAgente.includes('conv-nome-alter'), false);
    assert.ok(idsAgente.includes('conv-aberta'));
    assert.ok(idsAgente.includes('conv-nome-affix'));

    const porOutroAgente = await app.inject({
      method: 'GET',
      url: '/monitoramento?administradora=Affix&agente=affix-0800',
      headers
    });
    const idsOutroAgente = monitoramentoListagemResponseSchema
      .parse(porOutroAgente.json())
      .itens.map((item) => item.id);
    assert.equal(idsOutroAgente.includes('conv-nome-affix'), false);
    assert.ok(idsOutroAgente.includes('conv-outro-agente'));

    const detalhe = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-fora',
      headers
    });
    assert.equal(detalhe.statusCode, 200, detalhe.body);
    const bruto = detalhe.json() as Record<string, unknown>;
    assert.equal('audio' in bruto, false);
    assert.equal('downloadDeAudio' in bruto, false);
    const aberto = monitoramentoDetalheSchema.parse(bruto);
    assert.equal(aberto.administradora, null);
    assert.equal(aberto.agente, 'Clara de outra operação');
    assert.equal(aberto.transcricao[0]?.texto, 'Fora do catálogo.');
  }, conversas);
});

test('a busca na fonte segue página só de concluídos até 5 e a tela fica na primeira de 50', async () => {
  const chamadas: string[] = [];
  const fetchOriginal = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    chamadas.push(url);
    const cursor = url.match(/cursor=([^&]+)/)?.[1];
    const pagina = cursor ? Number(decodeURIComponent(cursor)) : 1;

    if (pagina < 5) {
      return new Response(
        JSON.stringify({
          conversations: [
            {
              conversation_id: `conv-feita-${pagina}`,
              agent_id: 'affix-wa',
              status: 'done'
            }
          ],
          has_more: true,
          next_cursor: String(pagina + 1)
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        conversations: Array.from({ length: 51 }, (_, indice) => ({
          conversation_id: `conv-aberta-${indice}`,
          agent_id: 'affix-wa',
          agent_name: 'Clara Affix WhatsApp',
          status: 'in-progress',
          start_time_unix_secs: agoraUnix
        })),
        has_more: true,
        next_cursor: '6'
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const app = await buildApp();
  const marco = chamadas.length;

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento?pagina=2',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const lista = monitoramentoListagemResponseSchema.parse(response.json());
    const daTela = chamadas.slice(marco);

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(lista.pagina, 1);
    assert.equal(lista.tamanho, 50);
    assert.equal(lista.total, 51);
    assert.equal(lista.itens.length, 50);
    assert.equal(lista.fonteConfigurada, true);
    assert.equal(
      lista.itens.some((item) => item.id.startsWith('conv-feita')),
      false
    );
    assert.equal(daTela.length, 5);
    assert.equal(
      daTela.some((url) => url.includes('cursor=6')),
      false
    );
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = fetchOriginal;
  }
});

test('a lista ao vivo descarta id de conversa que não cabe na rota', async () => {
  const conversas = [
    {
      conversation_id: 'conv-segura',
      agent_id: 'affix-wa',
      agent_name: 'Clara Affix WhatsApp',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix
    },
    {
      conversation_id: '../login',
      agent_id: 'affix-wa',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix
    },
    {
      conversation_id: 'a'.repeat(129),
      agent_id: 'affix-wa',
      status: 'in-progress',
      start_time_unix_secs: agoraUnix
    }
  ];

  await comFonte(async (app) => {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const ids = monitoramentoListagemResponseSchema
      .parse(response.json())
      .itens.map((item) => item.id);

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(ids, ['conv-segura']);
  }, conversas);
});

test('sem a chave da fonte a lista não finge Recorte vazio', async () => {
  const fetchOriginal = globalThis.fetch;
  let chamadas = 0;
  delete process.env.ELEVENLABS_API_KEY;
  globalThis.fetch = (async () => {
    chamadas += 1;
    return new Response('nao deveria', { status: 500 });
  }) as typeof fetch;
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const lista = monitoramentoListagemResponseSchema.parse(response.json());

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(lista.fonteConfigurada, false);
    assert.deepEqual(lista.itens, []);
    assert.equal(
      mensagemDaListaAoVivo(lista),
      'A fonte não está configurada.'
    );
    assert.equal(chamadas, 0);
    assert.equal(
      mensagemDaListaAoVivo({ fonteConfigurada: true, itens: [] }),
      'Nenhum Atendimento aberto neste Recorte.'
    );
    assert.equal(
      mensagemDaListaAoVivo({ fonteConfigurada: true, itens: [{ id: 'conv-aberta' }] }),
      null
    );
  } finally {
    await app.close();
    globalThis.fetch = fetchOriginal;
  }
});

test('o pulso ao vivo só reinicia quando o Recorte muda e repete a primeira falha', () => {
  assert.equal(consultaDaListaAoVivo(new URLSearchParams('inicio=2026-09-01&fim=2026-09-30')), '');
  assert.equal(consultaDaListaAoVivo(new URLSearchParams('administradora=&agente=')), '');
  assert.equal(
    consultaDaListaAoVivo(new URLSearchParams('administradora=Alter&inicio=2026-09-01')),
    'administradora=Alter'
  );
  assert.equal(destinoDaFalhaInicial({ descartada: true, podeRepetir: true }), 'ignorar');
  assert.equal(destinoDaFalhaInicial({ descartada: false, podeRepetir: true }), 'repetir');
  assert.equal(destinoDaFalhaInicial({ descartada: false, podeRepetir: false }), 'erro');
});

test('pulso de 10 segundos busca com a área visível, espera oculta e conserva a lista', () => {
  assert.equal(intervaloDoPulsoMs, 10_000);
  assert.equal(
    deveBuscarDeNovo({ visivel: true, emCurso: true, ultimaBusca: null, agora: 20_000 }),
    false
  );
  assert.equal(
    deveBuscarDeNovo({ visivel: true, emCurso: false, ultimaBusca: null, agora: 20_000 }),
    true
  );
  assert.equal(
    deveBuscarDeNovo({ visivel: true, emCurso: false, ultimaBusca: 10_000, agora: 19_999 }),
    false
  );
  assert.equal(devePulsar({ visivel: true, msDesdeUltimaBusca: 10_000 }), true);
  assert.equal(devePulsar({ visivel: true, msDesdeUltimaBusca: 9_999 }), false);
  assert.equal(devePulsar({ visivel: false, msDesdeUltimaBusca: 10_000 }), false);
  assert.equal(esperaDoPulso(0, 50_000), 10_000);
  assert.equal(esperaDoPulso(1_000, 1_001), 9_999);
  assert.equal(esperaDoPulso(1_000, 11_000), 0);

  const lista = { id: 'conv-aberta' };
  const conservada = aplicarCargaDaLista({
    listaAtual: lista,
    carga: { ok: false }
  });
  assert.equal(conservada.erro, false);
  assert.deepEqual(conservada.lista, lista);

  const primeiraFalha = aplicarCargaDaLista({
    listaAtual: null,
    carga: { ok: false }
  });
  assert.equal(primeiraFalha.erro, true);
  assert.equal(primeiraFalha.lista, null);

  const atualizada = aplicarCargaDaLista({
    listaAtual: lista,
    carga: { ok: true, lista: { id: 'conv-nova' } }
  });
  assert.equal(atualizada.erro, false);
  assert.deepEqual(atualizada.lista, { id: 'conv-nova' });

  const comLista = reduzirCargaAoVivo(
    { lista: null, erro: null },
    {
      tipo: 'lista',
      lista: { id: 'conv-fora' }
    }
  );
  assert.equal(comLista.erro, null);
  assert.deepEqual(comLista.lista, { id: 'conv-fora' });
  const abortadaDepois = reduzirCargaAoVivo(comLista, {
    tipo: 'falha',
    vigente: false,
    abortada: true
  });
  assert.equal(abortadaDepois.erro, null);
  assert.deepEqual(abortadaDepois.lista, { id: 'conv-fora' });
  const falhaSemLista = reduzirCargaAoVivo(
    { lista: null, erro: null },
    { tipo: 'falha', vigente: true, abortada: false }
  );
  assert.equal(falhaSemLista.erro, 'listagem');
  assert.equal(falhaSemLista.lista, null);
});

test('lista ao vivo mostra o atendimento mesmo sem agente no catálogo', () => {
  const corpo = {
    recorte: { administradora: null, agente: null },
    pagina: 1,
    tamanho: 50,
    total: 2,
    fonteConfigurada: true,
    itens: [
      {
        id: 'conv_8501m3mwt29ceb18b55d68zgg6z',
        administradora: null,
        agente: 'Clara - Roteador | Alter',
        agenteId: 'agent_3701kr451qfdevqy90mp8p2qrxz',
        iniciadoEm: '2026-09-28T20:00:00.000Z',
        motivo: 'Não informado',
        status: 'Em andamento'
      },
      {
        id: 'conv_0901m3mjtxhevna7kq1bhwfhgfp',
        agente: 'Clara Retencao Alter',
        agenteId: 'agent_7001k5y7pf7fxrvp074j6s4wx5m',
        iniciadoEm: agoraUnix,
        motivo: '',
        status: 'in-progress',
        administradora: 'fora-do-catalogo'
      }
    ]
  };
  const lista = normalizarListagemAoVivo(corpo);

  assert.ok(lista);
  assert.equal(lista?.itens.length, 2);
  assert.equal(lista?.itens[0]?.agente, 'Clara - Roteador | Alter');
  assert.equal(lista?.itens[0]?.administradora, null);
  assert.equal(lista?.itens[1]?.agente, 'Clara Retencao Alter');
  assert.equal(lista?.itens[1]?.administradora, null);
  assert.equal(lista?.itens[1]?.motivo, 'Não informado');
  assert.equal(lista?.itens[1]?.status, 'Em andamento');
  assert.equal(lista?.itens[1]?.iniciadoEm, new Date(agoraUnix * 1000).toISOString());
  assert.equal(
    textoDaLinhaAoVivo({
      agente: 'Leo - Vinnk - Affix',
      iniciadoEm: '2026-09-28T20:00:00.000Z'
    }),
    'Leo - Vinnk - Affix · 28/09 17:00'
  );
  assert.equal(mensagemDaListaAoVivo(lista ?? { fonteConfigurada: true, itens: [] }), null);
});

test('lista ao vivo não inventa horário e descarta linha sem identidade', () => {
  const corpo = {
    recorte: { administradora: null, agente: null },
    pagina: 1,
    tamanho: 50,
    total: 4,
    fonteConfigurada: true,
    itens: [
      {
        id: 'conv-leo',
        agente: 'Leo - Vinnk - Affix',
        agenteId: 'agent_9501ky0zs09df67bt7wfkmr4e7mq',
        motivo: 'Não informado',
        status: 'Em andamento'
      },
      {
        id: 'conv-zero',
        agente: 'Leo - Vinnk - Affix',
        agenteId: 'agent_9501ky0zs09df67bt7wfkmr4e7mq',
        iniciadoEm: 0,
        motivo: 'Não informado',
        status: 'Em andamento'
      },
      {
        agente: 'sem conversa',
        agenteId: 'agent_9501ky0zs09df67bt7wfkmr4e7mq'
      },
      {
        id: 'conv-sem-agente',
        agente: 'Leo - Vinnk - Affix'
      }
    ]
  };
  const lista = normalizarListagemAoVivo(corpo);
  const soSemIdentidade = normalizarListagemAoVivo({
    ...corpo,
    itens: [{ agente: 'sem identidade' }]
  });

  assert.ok(lista);
  assert.equal(lista?.itens.length, 2);
  assert.equal(lista?.itens[0]?.iniciadoEm, undefined);
  assert.equal(lista?.itens[1]?.iniciadoEm, undefined);
  assert.equal(textoDaLinhaAoVivo(lista?.itens[0] ?? { agente: '' }), 'Leo - Vinnk - Affix');
  assert.equal(mensagemDaListaAoVivo(lista ?? { fonteConfigurada: true, itens: [] }), null);
  assert.ok(soSemIdentidade);
  assert.equal(soSemIdentidade?.itens.length, 0);
  assert.equal(
    mensagemDaListaAoVivo(soSemIdentidade ?? { fonteConfigurada: true, itens: [] }),
    'Nenhum Atendimento aberto neste Recorte.'
  );
  assert.equal(normalizarListagemAoVivo({ fonteConfigurada: true }), null);

  const epoca = normalizarListagemAoVivo({
    recorte: { administradora: null, agente: null },
    pagina: 1,
    tamanho: 50,
    total: 1,
    fonteConfigurada: true,
    itens: [
      {
        id: 'conv-epoca',
        administradora: null,
        agente: 'Leo - Vinnk - Affix',
        agenteId: 'agent_9501ky0zs09df67bt7wfkmr4e7mq',
        iniciadoEm: '1970-01-01T00:00:00.000Z',
        motivo: 'Não informado',
        status: 'Em andamento'
      }
    ]
  });
  assert.equal(epoca?.itens[0]?.iniciadoEm, undefined);
  assert.equal(textoDaLinhaAoVivo(epoca?.itens[0] ?? { agente: '' }), 'Leo - Vinnk - Affix');
});

test('lista ao vivo aceita agentId e mapeia para agenteId no item', () => {
  const corpo = {
    recorte: { administradora: null, agente: null },
    pagina: 1,
    tamanho: 50,
    total: 1,
    fonteConfigurada: true,
    itens: [
      {
        id: 'conv_8401m3sfqg6qf3081k5rp9d3txxy',
        agente: 'Clara - Roteador | Alter',
        agentId: 'agent_3701kr451qfdevqry90mp8p2qrxz',
        motivo: 'Não informado',
        status: 'Em andamento'
      }
    ]
  };

  const normalizado = normalizarListagemAoVivo(corpo);
  assert.ok(normalizado);
  assert.equal(normalizado?.itens.length, 1);
  assert.equal(normalizado?.itens[0]?.agenteId, 'agent_3701kr451qfdevqry90mp8p2qrxz');
});

test('lista ao vivo com 0 atendimentos normaliza com sucesso e exibe mensagem de recorte vazio', () => {
  const corpoVazio = {
    recorte: { administradora: null, agente: null },
    pagina: 1,
    tamanho: 50,
    total: 0,
    fonteConfigurada: true,
    itens: []
  };

  const normalizado = normalizarListagemAoVivo(corpoVazio);
  assert.ok(normalizado);
  assert.equal(normalizado?.itens.length, 0);
  assert.equal(mensagemDaListaAoVivo(normalizado), 'Nenhum Atendimento aberto neste Recorte.');
});

test('lista ao vivo lê o início em segundos e não grava o relógio atual', async () => {
  const segundos = agoraUnix;

  await comFonte(
    async (app) => {
      const sessao = await sessaoDe(app, 'ana.souza@crion');
      const headers = { authorization: `Bearer ${sessao}` };
      const response = await app.inject({
        method: 'GET',
        url: '/monitoramento',
        headers
      });
      const lista = monitoramentoListagemResponseSchema.parse(response.json());
      const semInicio = lista.itens.find((item) => item.id === 'conv-sem-inicio');
      const peloMetadata = lista.itens.find((item) => item.id === 'conv-metadata');
      const detalhe = await app.inject({
        method: 'GET',
        url: '/monitoramento/conv-metadata',
        headers
      });
      const corpoDetalhe = monitoramentoDetalheSchema.parse(detalhe.json());

      assert.equal(response.statusCode, 200, response.body);
      assert.equal(semInicio, undefined);
      assert.equal(peloMetadata?.iniciadoEm, new Date(segundos * 1000).toISOString());
      assert.equal(detalhe.statusCode, 200, detalhe.body);
      assert.equal(corpoDetalhe.iniciadoEm, new Date(segundos * 1000).toISOString());
    },
    [
      {
        conversation_id: 'conv-sem-inicio',
        agent_id: 'agent-sem-inicio',
        agent_name: 'Leo - Vinnk - Affix',
        status: 'in-progress',
        start_time_unix_secs: 0
      },
      {
        conversation_id: 'conv-metadata',
        agent_id: 'agent-metadata',
        agent_name: 'Leo - Vinnk - Affix',
        status: 'in-progress',
        start_time_unix_secs: 0,
        metadata: { start_time_unix_secs: segundos },
        transcript: [{ role: 'agent', message: 'Olá.', time_in_call_secs: 1 }]
      }
    ]
  );
});

test('transcrição ao vivo semeia, acrescenta, corrige, não corta e permanece', () => {
  const espera = observarTranscricao(
    { transcricao: [], observando: true },
    { aberto: true, transcricao: [] }
  );
  assert.deepEqual(espera.transcricao, []);
  assert.equal(espera.observando, true);
  assert.equal(avisoDaTranscricao({ observando: true, quantidade: 0 }), 'Aguardando a próxima fala.');

  const sementeFonte: TurnoDaTranscricao[] = [
    { locutor: 'Agente de Voz', quando: '0:01', texto: 'Olá, sou a Clara.' },
    { locutor: 'Cliente', quando: '0:04', texto: 'Preciso de ajuda.' },
    { locutor: 'Agente de Voz', quando: '0:08', texto: 'Vou ver.' },
    { locutor: 'Cliente', quando: '0:12', texto: 'A rede.' },
    { locutor: 'Agente de Voz', quando: '0:15', texto: 'Um momento.' },
    { locutor: 'Cliente', quando: '0:18', texto: 'Obrigado.' }
  ];
  const semente = observarTranscricao(espera, { aberto: true, transcricao: sementeFonte });
  assert.deepEqual(semente.transcricao, sementeFonte);
  assert.equal(semente.transcricao[0]?.texto, 'Olá, sou a Clara.');
  assert.equal(avisoDaTranscricao({ observando: true, quantidade: semente.transcricao.length }), null);

  const comFalaNova = observarTranscricao(semente, {
    aberto: true,
    transcricao: [
      ...sementeFonte,
      { locutor: 'Agente de Voz', quando: '0:22', texto: 'Encontrei a rede.' }
    ]
  });
  assert.equal(comFalaNova.transcricao.length, sementeFonte.length + 1);
  assert.equal(comFalaNova.transcricao[0]?.texto, 'Olá, sou a Clara.');
  assert.equal(comFalaNova.transcricao.at(-1)?.texto, 'Encontrei a rede.');
  assert.equal(
    comFalaNova.transcricao.filter((turno) => turno.texto === 'Olá, sou a Clara.').length,
    1
  );

  const corrigida = observarTranscricao(comFalaNova, {
    aberto: true,
    transcricao: [
      ...sementeFonte.slice(0, 5),
      { locutor: 'Cliente', quando: '0:18', texto: 'Obrigado.' },
      { locutor: 'Agente de Voz', quando: '0:22', texto: 'Encontrei a rede credenciada.' }
    ]
  });
  assert.equal(corrigida.transcricao.length, comFalaNova.transcricao.length);
  assert.equal(corrigida.transcricao[0]?.texto, 'Olá, sou a Clara.');
  assert.equal(corrigida.transcricao.at(-1)?.texto, 'Encontrei a rede credenciada.');
  assert.equal(
    corrigida.transcricao.filter((turno) => turno.locutor === 'Agente de Voz').at(-1)?.texto,
    'Encontrei a rede credenciada.'
  );

  const repetida = observarTranscricao(corrigida, {
    aberto: true,
    transcricao: corrigida.transcricao
  });
  assert.deepEqual(repetida.transcricao, corrigida.transcricao);

  const comInsercao = observarTranscricao(
    {
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:01', texto: 'Olá.' },
        { locutor: 'Cliente', quando: '0:04', texto: 'Oi.' },
        { locutor: 'Agente de Voz', quando: '0:08', texto: 'Vou ver.' }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:01', texto: 'Olá.' },
        { locutor: 'Cliente', quando: '0:04', texto: 'Oi.' },
        { locutor: 'Cliente', quando: '0:06', texto: 'Espera.' },
        { locutor: 'Agente de Voz', quando: '0:08', texto: 'Vou verificar.' }
      ]
    }
  );
  assert.equal(comInsercao.transcricao.length, 4);
  assert.equal(comInsercao.transcricao[0]?.texto, 'Olá.');
  assert.equal(comInsercao.transcricao[2]?.texto, 'Espera.');
  assert.equal(comInsercao.transcricao[3]?.texto, 'Vou verificar.');
  assert.equal(
    comInsercao.transcricao.filter((turno) => turno.locutor === 'Agente de Voz' && turno.quando === '0:08')
      .length,
    1
  );

  const semCorteDoInicio = observarTranscricao(
    {
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:01', texto: 'Olá.' },
        { locutor: 'Cliente', quando: '0:04', texto: 'Oi.' },
        { locutor: 'Agente de Voz', quando: '0:08', texto: 'Vou ver.' }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:08', texto: 'Outra abertura.' },
        { locutor: 'Cliente', quando: '0:10', texto: 'Nova.' },
        { locutor: 'Agente de Voz', quando: '0:12', texto: 'Segue.' },
        { locutor: 'Cliente', quando: '0:14', texto: 'Certo.' }
      ]
    }
  );
  assert.equal(semCorteDoInicio.transcricao[0]?.texto, 'Olá.');
  assert.equal(semCorteDoInicio.transcricao[1]?.texto, 'Oi.');
  assert.equal(semCorteDoInicio.transcricao[2]?.texto, 'Outra abertura.');
  assert.equal(semCorteDoInicio.transcricao[3]?.texto, 'Nova.');
  assert.equal(semCorteDoInicio.transcricao[4]?.texto, 'Segue.');
  assert.equal(semCorteDoInicio.transcricao[5]?.texto, 'Certo.');
  assert.equal(
    semCorteDoInicio.transcricao.filter((turno) => turno.texto === 'Olá.').length,
    1
  );

  const encerrada = observarTranscricao(corrigida, {
    aberto: false,
    transcricao: corrigida.transcricao
  });
  assert.equal(encerrada.observando, false);
  assert.deepEqual(encerrada.transcricao, corrigida.transcricao);
  assert.equal(
    textoDaObservacao(false),
    'Observação encerrada. O texto permanece, sem áudio e sem ação no contato.'
  );
  assert.equal(
    textoDaObservacao(true),
    'Observação em texto, sem áudio e sem ação no contato.'
  );

  const depois = observarTranscricao(encerrada, {
    aberto: true,
    transcricao: [
      ...corrigida.transcricao,
      { locutor: 'Cliente', quando: '0:40', texto: 'Não entra mais.' }
    ]
  });
  assert.equal(depois.observando, false);
  assert.deepEqual(depois.transcricao, corrigida.transcricao);

  assert.equal(acompanhaOFim({ altura: 800, rolagem: 700, visivel: 80 }), true);
  assert.equal(acompanhaOFim({ altura: 800, rolagem: 0, visivel: 80 }), false);

  const repetidaNoCanal = aplicarEventoDaObservacao(semente, {
    tipo: 'fala',
    locutor: 'Agente de Voz',
    texto: 'Um momento.'
  });
  assert.equal(repetidaNoCanal.transcricao.length, semente.transcricao.length);
  assert.equal(repetidaNoCanal.transcricao[0]?.texto, 'Olá, sou a Clara.');

  const comFalaDoCanal = aplicarEventoDaObservacao(semente, {
    tipo: 'fala',
    locutor: 'Cliente',
    texto: 'Ainda estou aqui.'
  });
  const fundidaDepois = observarTranscricao(comFalaDoCanal, {
    aberto: true,
    transcricao: [
      ...semente.transcricao,
      { locutor: 'Cliente', quando: '0:30', texto: 'Ainda estou aqui.' },
      { locutor: 'Agente de Voz', quando: '0:34', texto: 'Pode falar.' }
    ]
  });
  assert.equal(fundidaDepois.transcricao[0]?.texto, 'Olá, sou a Clara.');
  assert.equal(
    fundidaDepois.transcricao.filter((turno) => turno.texto === 'Ainda estou aqui.').length,
    1
  );
  assert.equal(fundidaDepois.transcricao.at(-1)?.texto, 'Pode falar.');

  const aberturaJaNaTela = aplicarEventoDaObservacao(semente, {
    tipo: 'fala',
    locutor: 'Agente de Voz',
    texto: 'Olá, sou a Clara.'
  });
  assert.equal(aberturaJaNaTela.transcricao.length, semente.transcricao.length);
  assert.equal(
    aberturaJaNaTela.transcricao.filter((turno) => turno.texto === 'Olá, sou a Clara.').length,
    1
  );

  const novaNoCanal = aplicarEventoDaObservacao(semente, {
    tipo: 'fala',
    locutor: 'Cliente',
    texto: 'Continua.'
  });
  assert.equal(novaNoCanal.transcricao.length, semente.transcricao.length + 1);
  assert.equal(novaNoCanal.transcricao.at(-1)?.texto, 'Continua.');
  assert.equal(novaNoCanal.transcricao[0]?.texto, 'Olá, sou a Clara.');

  const corrigidaNoCanal = aplicarEventoDaObservacao(novaNoCanal, {
    tipo: 'correcao',
    texto: 'Um momento, por favor.'
  });
  assert.equal(corrigidaNoCanal.transcricao.length, novaNoCanal.transcricao.length);
  assert.equal(corrigidaNoCanal.transcricao[0]?.texto, 'Olá, sou a Clara.');
  assert.equal(
    corrigidaNoCanal.transcricao.filter((turno) => turno.locutor === 'Agente de Voz').at(-1)?.texto,
    'Um momento, por favor.'
  );

  const fimDoCanal = aplicarEventoDaObservacao(corrigidaNoCanal, { tipo: 'encerrada' });
  assert.equal(fimDoCanal.observando, false);
  assert.deepEqual(fimDoCanal.transcricao, corrigidaNoCanal.transcricao);
  assert.deepEqual(
    aplicarEventoDaObservacao(fimDoCanal, {
      tipo: 'fala',
      locutor: 'Cliente',
      texto: 'Não entra mais.'
    }).transcricao,
    fimDoCanal.transcricao
  );
});

test('GET /monitoramento/:id responde 502 quando a fonte falha', async () => {
  const fetchOriginal = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
  globalThis.fetch = (async () => new Response('falhou', { status: 503 })) as typeof fetch;
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento/conv-aberta',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().statusCode, 502);
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = fetchOriginal;
  }
});

test('GET /monitoramento responde 502 quando a fonte falha', async () => {
  const fetchOriginal = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
  globalThis.fetch = (async () => new Response('falhou', { status: 503 })) as typeof fetch;
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/monitoramento',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().statusCode, 502);
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = fetchOriginal;
  }
});

test('a lista da fonte repete uma vez quando a espera estoura', async () => {
  let chamadas = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    chamadas += 1;

    if (chamadas === 1) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('tempo esgotado');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }

    return new Response(
      JSON.stringify({
        conversations: [
          {
            conversation_id: 'conv-lenta',
            agent_id: 'affix-wa',
            status: 'in-progress'
          }
        ],
        has_more: false
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const conversas = await listarConversasElevenLabs({
    apiKey: 'chave-de-teste',
    baseUrl: 'https://api.elevenlabs.io',
    fetchImpl,
    maxPaginas: 5,
    esperaMs: 20
  });

  assert.equal(chamadas, 2);
  assert.equal(conversas[0]?.conversation_id, 'conv-lenta');
});

test('a busca da lista para quando o cliente cancela', async () => {
  const controller = new AbortController();
  let paginas = 0;
  const fetchImpl = (async () => {
    paginas += 1;
    return new Response(
      JSON.stringify({
        conversations: [],
        has_more: true,
        next_cursor: String(paginas + 1)
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const busca = listarConversasElevenLabs({
    apiKey: 'chave-de-teste',
    baseUrl: 'https://api.elevenlabs.io',
    fetchImpl,
    maxPaginas: 5,
    signal: controller.signal
  });
  controller.abort();

  await assert.rejects(busca, (error: unknown) => {
    assert.equal(error instanceof Error && error.name, 'AbortError');
    return true;
  });
  assert.equal(paginas, 1);
});

test('o canal ao vivo autentica a sessão e só observa a fonte', () => {
  assert.equal(
    urlDoMonitorDaFonte('https://api.elevenlabs.io/', 'conv-aberta'),
    'wss://api.elevenlabs.io/v1/convai/conversations/conv-aberta/monitor'
  );
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'agent_response',
      agent_response_event: { agent_response: 'Olá.' }
    }),
    { tipo: 'fala', locutor: 'Agente de Voz', texto: 'Olá.' }
  );
  assert.equal(
    eventoDaMensagemDaFonte({
      type: 'agent_response_correction',
      agent_response_correction_event: { corrected_agent_response: 'Olá, sou a Clara.' }
    })?.tipo,
    'correcao'
  );
  assert.equal(eventoDaMensagemDaFonte({ type: 'interruption' }), undefined);
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'agent_tool_request',
      agent_tool_request: { tool_name: 'enviar_sms', tool_call_id: 'c1' }
    }),
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'enviar_sms',
        nomeDaFerramenta: 'enviar_sms',
        id: 'c1'
      }
    }
  );
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'agent_tool_response',
      agent_tool_response: {
        tool_name: 'enviar_sms',
        tool_call_id: 'c1',
        tool_type: 'webhook',
        is_error: false,
        event_id: 4,
        is_called: true,
        status: 'success'
      }
    }),
    {
      tipo: 'resultado',
      resultado: {
        id: 'c1',
        nome: 'enviar_sms',
        veredito: 'Sucesso',
        tipoDaFonte: 'webhook'
      }
    }
  );
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'agent_tool_response_full_payload',
      agent_tool_response_full_payload: {
        tool_name: 'enviar_sms',
        tool_call_id: 'sms-1',
        tool_type: 'webhook',
        is_error: false,
        full_tool_result: '{"protocolo":"123"}'
      }
    }),
    {
      tipo: 'resultado',
      resultado: {
        id: 'sms-1',
        nome: 'enviar_sms',
        veredito: 'Sucesso',
        resposta: '{\n  "protocolo": "123"\n}',
        tipoDaFonte: 'webhook'
      }
    }
  );
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'agent_tool_response',
      agent_tool_response: {
        tool_name: 'ocultar',
        tool_call_id: 'c2',
        tool_type: 'system',
        is_error: false,
        event_id: 5,
        is_called: false,
        status: 'skipped'
      }
    }),
    {
      tipo: 'cancelamento',
      chamada: { id: 'c2', nome: 'ocultar' }
    }
  );
  assert.deepEqual(
    eventoDaMensagemDaFonte({
      type: 'client_tool_call',
      client_tool_call: { tool_name: 'transfer_to_number', tool_call_id: 'c3', parameters: {} }
    }),
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'transfer_to_number',
        nomeDaFerramenta: 'transfer_to_number',
        id: 'c3',
        parametros: '{}'
      }
    }
  );
  assert.equal(sessaoDaMensagem('{"tipo":"sessao","sessao":"abc"}'), 'abc');
  assert.equal(sessaoDaMensagem('{"type":"interrupt"}'), undefined);

  const enviadosAoCliente: string[] = [];
  const enviadosAFonte: string[] = [];
  const ouvintes = new Map<string, Array<(...args: unknown[]) => void>>();
  const cliente = {
    readyState: 1,
    OPEN: 1,
    CONNECTING: 0,
    send(data: string) {
      enviadosAoCliente.push(data);
    },
    close() {
      this.readyState = 3;
    },
    on(evento: string, ouvinte: (...args: unknown[]) => void) {
      const lista = ouvintes.get(`cliente:${evento}`) ?? [];
      lista.push(ouvinte);
      ouvintes.set(`cliente:${evento}`, lista);
    }
  };
  let fonte:
    | {
        readyState: number;
        OPEN: number;
        CONNECTING: number;
        send: (data: string) => void;
        close: () => void;
        on: (evento: string, ouvinte: (...args: unknown[]) => void) => void;
        emitir: (evento: string, ...args: unknown[]) => void;
      }
    | undefined;

  createMonitoramentoProxy({
    client: cliente as never,
    apiKey: 'segredo-da-fonte',
    monitorUrl: urlDoMonitorDaFonte('https://api.elevenlabs.io', 'conv-aberta'),
    connect: () => {
      const locais = new Map<string, Array<(...args: unknown[]) => void>>();
      fonte = {
        readyState: 0,
        OPEN: 1,
        CONNECTING: 0,
        send(data: string) {
          enviadosAFonte.push(data);
        },
        close() {
          this.readyState = 3;
        },
        on(evento: string, ouvinte: (...args: unknown[]) => void) {
          const lista = locais.get(evento) ?? [];
          lista.push(ouvinte);
          locais.set(evento, lista);
        },
        emitir(evento: string, ...args: unknown[]) {
          for (const ouvinte of locais.get(evento) ?? []) {
            ouvinte(...args);
          }
        }
      };
      return fonte as never;
    }
  });

  assert.ok(fonte);
  fonte.readyState = 1;
  fonte.emitir('open');
  assert.equal(JSON.parse(enviadosAoCliente.at(-1) ?? '').tipo, 'pronto');
  fonte.emitir(
    'message',
    JSON.stringify({
      type: 'user_transcript',
      user_transcription_event: { user_transcript: 'Preciso de ajuda.' }
    })
  );
  assert.deepEqual(JSON.parse(enviadosAoCliente.at(-1) ?? ''), {
    tipo: 'fala',
    locutor: 'Cliente',
    texto: 'Preciso de ajuda.'
  });
  fonte.emitir('message', 'x'.repeat(70_000));
  assert.equal(enviadosAoCliente.length, 2);
  fonte.emitir(
    'message',
    JSON.stringify({
      type: 'agent_tool_response',
      agent_tool_response: {
        tool_call_id: 'sms-1',
        tool_name: 'enviar_sms',
        is_error: false,
        tool_has_been_called: true,
        result_value: 'y'.repeat(70_000)
      }
    })
  );
  assert.equal(JSON.parse(enviadosAoCliente.at(-1) ?? '').tipo, 'resultado');
  assert.equal(JSON.parse(enviadosAoCliente.at(-1) ?? '').resultado.resposta.length, 4_096);
  for (const ouvinte of ouvintes.get('cliente:message') ?? []) {
    ouvinte(JSON.stringify({ type: 'interrupt' }));
  }
  assert.deepEqual(enviadosAFonte, []);
  assert.equal(enviadosAoCliente.some((item) => item.includes('segredo-da-fonte')), false);
  fonte.emitir('close');
  assert.equal(JSON.parse(enviadosAoCliente.at(-1) ?? '').tipo, 'encerrada');
});

test('pulso troca a fala longa do socket pela transcrição da fonte com ferramenta', () => {
  const tela = observarTranscricao(
    {
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '—',
          texto: 'Aguarde um instante enquanto consulto aqui. Seu protocolo foi enviado.'
        },
        { locutor: 'Cliente', quando: '—', texto: 'Quero falar com a atendente.' },
        {
          locutor: 'Agente de Voz',
          quando: '—',
          texto: 'Vou te transferir para uma atendente agora.'
        }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:05',
          texto: 'Aguarde um instante enquanto consulto aqui.\n[Chamada de Ferramenta: enviar_sms]'
        },
        {
          locutor: 'Agente de Voz',
          quando: '0:12',
          texto: 'Seu protocolo foi enviado.\n[Resultado da Ferramenta: enviar_sms - Sucesso]'
        },
        { locutor: 'Cliente', quando: '0:40', texto: 'Quero falar com a atendente.' },
        {
          locutor: 'Agente de Voz',
          quando: '0:44',
          texto:
            'Vou te transferir para uma atendente agora.\n[Chamada de Ferramenta: transfer_to_number]\n[Resultado da Ferramenta: transfer_to_number - Sucesso]'
        }
      ]
    }
  );

  assert.equal(tela.transcricao.length, 4);
  assert.equal(tela.transcricao[0]?.quando, '0:05');
  assert.equal(
    tela.transcricao[0]?.texto,
    'Aguarde um instante enquanto consulto aqui.\n[Chamada de Ferramenta: enviar_sms]'
  );
  assert.equal(
    tela.transcricao[1]?.texto,
    'Seu protocolo foi enviado.\n[Resultado da Ferramenta: enviar_sms - Sucesso]'
  );
  assert.equal(tela.transcricao[3]?.quando, '0:44');
  assert.equal(tela.transcricao.filter((turno) => turno.quando === '—').length, 0);
});

test('pulso não duplica a fala do socket quando a fonte acrescenta a ferramenta', () => {
  const tela = observarTranscricao(
    {
      transcricao: [{ locutor: 'Agente de Voz', quando: '—', texto: 'Vou consultar.' }],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto: 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]'
        }
      ]
    }
  );

  assert.equal(tela.transcricao.length, 1);
  assert.equal(tela.transcricao[0]?.quando, '0:08');
  assert.equal(
    tela.transcricao[0]?.texto,
    'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]'
  );
});

test('chamada ao vivo fica na fala do agente e a correção conserva o detalhe', () => {
  const comFala = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    { tipo: 'fala', locutor: 'Agente de Voz', texto: 'Vou consultar.' }
  );
  const comChamada = aplicarEventoDaObservacao(comFala, {
    tipo: 'chamada',
    detalhe: {
      tipo: 'Ferramenta',
      nome: 'consultar_plano',
      nomeDaFerramenta: 'consultar_plano',
      id: 'c1'
    }
  });
  const corrigida = aplicarEventoDaObservacao(comChamada, {
    tipo: 'correcao',
    texto: 'Vou verificar seu plano.'
  });

  assert.equal(comChamada.transcricao.length, 1);
  assert.equal(
    corrigida.transcricao[0]?.texto,
    'Vou verificar seu plano.\n[Chamada de Ferramenta: consultar_plano]'
  );
  assert.equal(corrigida.transcricao[0]?.detalhes?.[0]?.id, 'c1');
});

test('resultado ao vivo sem nome completa a chamada pelo id', () => {
  const comChamada = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'enviar_sms',
        nomeDaFerramenta: 'enviar_sms',
        id: 'sms-1'
      }
    }
  );
  const comResultado = aplicarEventoDaObservacao(comChamada, {
    tipo: 'resultado',
    resultado: { id: 'sms-1', veredito: 'Sucesso', resposta: '{"protocolo":"123"}' }
  });

  assert.equal(comResultado.transcricao.length, 1);
  assert.equal(comResultado.transcricao[0]?.detalhes?.length, 1);
  assert.equal(comResultado.transcricao[0]?.detalhes?.[0]?.nome, 'enviar_sms');
  assert.equal(comResultado.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
});

test('resultado ao vivo sem chamada anterior entra em novo turno sem fala', () => {
  const comFala = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    {
      tipo: 'fala',
      locutor: 'Agente de Voz',
      texto: 'Aguarde um instante enquanto consulto aqui.'
    }
  );
  const comResultado = aplicarEventoDaObservacao(comFala, {
    tipo: 'resultado',
    resultado: {
      id: 'sms-1',
      nome: 'enviar_sms',
      veredito: 'Sucesso',
      resposta: '{"protocolo":"123"}',
      tipoDaFonte: 'webhook'
    }
  });

  assert.equal(comResultado.transcricao.length, 2);
  assert.equal(comResultado.transcricao[0]?.texto, 'Aguarde um instante enquanto consulto aqui.');
  assert.equal(comResultado.transcricao[1]?.texto, '[Chamada de Ferramenta: enviar_sms]');
  assert.equal(comResultado.transcricao[1]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(comResultado.transcricao[1]?.detalhes?.[0]?.resposta, '{"protocolo":"123"}');
});

test('resultado ao vivo completa o detalhe da chamada e não abre outro turno', () => {
  const comChamada = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'transfer_to_number',
        nomeDaFerramenta: 'transfer_to_number',
        id: 'c3',
        parametros: '{}'
      }
    }
  );
  const comResultado = aplicarEventoDaObservacao(comChamada, {
    tipo: 'resultado',
    resultado: { id: 'c3', nome: 'transfer_to_number', veredito: 'Sucesso', resposta: '{"ok":true}' }
  });
  const orfao = aplicarEventoDaObservacao(comResultado, {
    tipo: 'resultado',
    resultado: { nome: 'outra', veredito: 'Falha' }
  });

  assert.equal(orfao.transcricao.length, 2);
  assert.equal(orfao.transcricao[0]?.texto, '[Chamada de Ferramenta: transfer_to_number]');
  assert.equal(orfao.transcricao[1]?.texto, '[Chamada de Ferramenta: outra]');
  assert.equal(orfao.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(orfao.transcricao[0]?.detalhes?.[0]?.resposta, '{"ok":true}');
  assert.equal(orfao.transcricao[1]?.detalhes?.[0]?.nome, 'outra');
  assert.equal(orfao.transcricao[1]?.detalhes?.[0]?.veredito, 'Falha');
});

test('cancelamento posterior remove somente a Chamada de Ferramenta identificada', () => {
  const cancelada = aplicarEventoDaObservacao(
    {
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto: 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c1'
            }
          ]
        },
        {
          locutor: 'Agente de Voz',
          quando: '—',
          texto: '[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c2'
            }
          ]
        }
      ],
      observando: true
    },
    { tipo: 'cancelamento', chamada: { id: 'c2', nome: 'consultar_plano' } }
  );

  assert.equal(cancelada.transcricao.length, 1);
  assert.equal(cancelada.transcricao[0]?.texto, 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]');
  assert.equal(cancelada.transcricao[0]?.detalhes?.[0]?.id, 'c1');
});

test('evento repetido da mesma Chamada de Ferramenta apenas completa o detalhe', () => {
  const inicial = aplicarEventoDaObservacao(
    { transcricao: [{ locutor: 'Agente de Voz', quando: '—', texto: 'Vou consultar.' }], observando: true },
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'consultar_plano',
        nomeDaFerramenta: 'consultar_plano',
        id: 'c1'
      }
    }
  );
  const repetida = aplicarEventoDaObservacao(inicial, {
    tipo: 'chamada',
    detalhe: {
      tipo: 'Ferramenta',
      nome: 'consultar_plano',
      nomeDaFerramenta: 'consultar_plano',
      id: 'c1',
      parametros: '{"cpf":"123"}'
    }
  });

  assert.equal(repetida.transcricao.length, 1);
  assert.equal(repetida.transcricao[0]?.detalhes?.length, 1);
  assert.equal(repetida.transcricao[0]?.detalhes?.[0]?.parametros, '{"cpf":"123"}');
  assert.equal(
    repetida.transcricao[0]?.texto,
    'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]'
  );
});

test('segunda chamada sem turno identificado cria outro turno sem fala', () => {
  const primeira = aplicarEventoDaObservacao(
    { transcricao: [{ locutor: 'Cliente', quando: '—', texto: 'Quero plano.' }], observando: true },
    {
      tipo: 'chamada',
      detalhe: { tipo: 'Ferramenta', nome: 'consultar', nomeDaFerramenta: 'consultar', id: 'c1' }
    }
  );
  const segunda = aplicarEventoDaObservacao(primeira, {
    tipo: 'chamada',
    detalhe: { tipo: 'Ferramenta', nome: 'detalhar', nomeDaFerramenta: 'detalhar', id: 'c2' }
  });

  assert.equal(segunda.transcricao.length, 3);
  assert.equal(segunda.transcricao[1]?.texto, '[Chamada de Ferramenta: consultar]');
  assert.equal(segunda.transcricao[2]?.texto, '[Chamada de Ferramenta: detalhar]');
});

test('chamada repetida sem id completa a mais antiga mesmo com veredito', () => {
  const comResultado = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    {
      tipo: 'resultado',
      resultado: { nome: 'consultar_plano', veredito: 'Sucesso', resposta: '{"p":1}' }
    }
  );
  const repetida = aplicarEventoDaObservacao(comResultado, {
    tipo: 'chamada',
    detalhe: {
      tipo: 'Ferramenta',
      nome: 'consultar_plano',
      nomeDaFerramenta: 'consultar_plano',
      parametros: '{"cpf":"000"}'
    }
  });

  assert.equal(repetida.transcricao.length, 1);
  assert.equal(repetida.transcricao[0]?.detalhes?.length, 1);
  assert.equal(repetida.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(repetida.transcricao[0]?.detalhes?.[0]?.parametros, '{"cpf":"000"}');
});

test('fonte posiciona a chamada provisória no turno correto sem duplicá-la', () => {
  const reconciliada = observarTranscricao(
    {
      transcricao: [
        { locutor: 'Agente de Voz', quando: '—', texto: 'Vou consultar.' },
        { locutor: 'Cliente', quando: '—', texto: 'Certo.' },
        {
          locutor: 'Agente de Voz',
          quando: '—',
          texto: '[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c1',
              veredito: 'Sucesso',
              resposta: '{"ok":true}'
            }
          ]
        }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto: 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c1'
            }
          ]
        },
        { locutor: 'Cliente', quando: '0:10', texto: 'Certo.' }
      ]
    }
  );

  assert.equal(reconciliada.transcricao.length, 2);
  assert.equal(reconciliada.transcricao[0]?.detalhes?.length, 1);
  assert.equal(reconciliada.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(reconciliada.transcricao[0]?.detalhes?.[0]?.resposta, '{"ok":true}');
});

test('pulso atrasado não apaga o veredito que o ao vivo já completou', () => {
  const tela = observarTranscricao(
    {
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto: 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c1',
              veredito: 'Sucesso',
              resposta: '{"ok":true}'
            }
          ]
        }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto: 'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_plano',
              nomeDaFerramenta: 'consultar_plano',
              id: 'c1'
            }
          ]
        }
      ]
    }
  );

  assert.equal(tela.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(tela.transcricao[0]?.detalhes?.[0]?.resposta, '{"ok":true}');
});

test('correção da fala não cai num turno que só tem ferramenta', () => {
  const corrigida = aplicarEventoDaObservacao(
    {
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:08', texto: 'Vou consultar.' },
        {
          locutor: 'Agente de Voz',
          quando: '0:09',
          texto: '[Chamada de Ferramenta: consultar_plano]'
        }
      ],
      observando: true
    },
    { tipo: 'correcao', texto: 'Vou verificar seu plano.' }
  );

  assert.equal(corrigida.transcricao[0]?.texto, 'Vou verificar seu plano.');
  assert.equal(corrigida.transcricao[1]?.texto, '[Chamada de Ferramenta: consultar_plano]');
});

test('observação atualiza turno já visto com a ferramenta e a correção conserva a linha', () => {
  const atualizada = observarTranscricao(
    {
      transcricao: [
        { locutor: 'Agente de Voz', quando: '0:01', texto: 'Olá.' },
        { locutor: 'Cliente', quando: '0:05', texto: 'pode seguir' },
        { locutor: 'Agente de Voz', quando: '0:20', texto: 'Pronto.' },
        { locutor: 'Agente de Voz', quando: '0:22', texto: 'Encontrei.' }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:01',
          texto: 'Olá.\n[Chamada de Ferramenta: consultar_plano]'
        },
        {
          locutor: 'Cliente',
          quando: '0:05',
          texto: 'pode seguir\n[Resultado da Ferramenta: consultar_plano - Sucesso]'
        },
        { locutor: 'Agente de Voz', quando: '0:20', texto: 'Pronto.' }
      ]
    }
  );

  assert.equal(atualizada.transcricao.length, 4);
  assert.equal(
    atualizada.transcricao[0]?.texto,
    'Olá.\n[Chamada de Ferramenta: consultar_plano]'
  );
  assert.equal(
    atualizada.transcricao[1]?.texto,
    'pode seguir\n[Resultado da Ferramenta: consultar_plano - Sucesso]'
  );
  assert.equal(atualizada.transcricao[3]?.texto, 'Encontrei.');

  const corrigida = aplicarEventoDaObservacao(
    {
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:08',
          texto:
            'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]\n[Resultado da Ferramenta: consultar_plano - Sucesso]'
        }
      ],
      observando: true
    },
    { tipo: 'correcao', texto: 'Vou verificar seu plano.' }
  );

  assert.equal(
    corrigida.transcricao[0]?.texto,
    'Vou verificar seu plano.\n[Chamada de Ferramenta: consultar_plano]\n[Resultado da Ferramenta: consultar_plano - Sucesso]'
  );
});

test('pulso completa parâmetros e resposta no Detalhe que só tem o veredito', () => {
  const tela = observarTranscricao(
    {
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:12',
          texto: 'Aguarde um instante.\n[Chamada de Ferramenta: consultar_cpf]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_cpf',
              nomeDaFerramenta: 'consultar_cpf',
              id: 'fc-1',
              veredito: 'Sucesso',
              tipoDaFonte: 'webhook'
            }
          ]
        }
      ],
      observando: true
    },
    {
      aberto: true,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:12',
          texto: 'Aguarde um instante.\n[Chamada de Ferramenta: consultar_cpf]',
          detalhes: [
            {
              tipo: 'Ferramenta',
              nome: 'consultar_cpf',
              nomeDaFerramenta: 'consultar_cpf',
              id: 'fc-1',
              parametros: '{\n  "cpf": "123"\n}',
              resposta: '{\n  "situacao": "ativo"\n}',
              veredito: 'Sucesso',
              tipoDaFonte: 'webhook'
            }
          ]
        }
      ]
    }
  );

  assert.equal(tela.transcricao[0]?.detalhes?.[0]?.parametros, '{\n  "cpf": "123"\n}');
  assert.equal(tela.transcricao[0]?.detalhes?.[0]?.resposta, '{\n  "situacao": "ativo"\n}');
  assert.equal(tela.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
});

test('resultado posterior completa a resposta da chamada que já tem Sucesso', () => {
  const comChamada = aplicarEventoDaObservacao(
    { transcricao: [], observando: true },
    {
      tipo: 'chamada',
      detalhe: {
        tipo: 'Ferramenta',
        nome: 'consultar_cpf',
        nomeDaFerramenta: 'consultar_cpf',
        id: 'fc-1',
        parametros: '{}'
      }
    }
  );
  const comVeredito = aplicarEventoDaObservacao(comChamada, {
    tipo: 'resultado',
    resultado: { id: 'fc-1', nome: 'consultar_cpf', veredito: 'Sucesso', tipoDaFonte: 'webhook' }
  });
  const comCorpo = aplicarEventoDaObservacao(comVeredito, {
    tipo: 'resultado',
    resultado: {
      id: 'fc-1',
      nome: 'consultar_cpf',
      veredito: 'Sucesso',
      resposta: '{\n  "situacao": "ativo"\n}'
    }
  });

  assert.equal(comCorpo.transcricao[0]?.detalhes?.[0]?.parametros, '{}');
  assert.equal(comCorpo.transcricao[0]?.detalhes?.[0]?.resposta, '{\n  "situacao": "ativo"\n}');
  assert.equal(comCorpo.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
});
