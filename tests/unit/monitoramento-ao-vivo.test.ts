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
  mensagemDaListaAoVivo,
  aplicarCargaDaLista,
  devePulsar,
  esperaDoPulso,
  intervaloDoPulsoMs
} from '../../apps/web/src/features/monitoramento/pulso.js';
import {
  avisoDaTranscricao,
  observarTranscricao,
  textoDaObservacao
} from '../../apps/web/src/features/monitoramento/observacao.js';

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
    assert.ok(idsAffix.includes('conv-aberta'));
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
    assert.ok(idsAgente.includes('conv-aberta'));

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

test('pulso de 10 segundos busca com a área visível, espera oculta e conserva a lista', () => {
  assert.equal(intervaloDoPulsoMs, 10_000);
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
  assert.equal(semCorteDoInicio.transcricao.length, 3);
  assert.equal(
    semCorteDoInicio.transcricao.filter((turno) => turno.locutor === 'Agente de Voz').at(-1)?.texto,
    'Vou ver.'
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
