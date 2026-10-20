import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { areasDaCasca } from '../../packages/contracts/src/casca.js';
import {
  painelDeCancelamentosResponseSchema,
  pesquisaIaCancelamentoResponseSchema,
  analisarPassivoResponseSchema
} from '../../packages/contracts/src/cancelamento.js';
import {
  atendimentoDetalheSchema
} from '../../packages/contracts/src/atendimento.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import {
  destinoDaLista,
  destinoDoBadge,
  periodoAteHoje,
  periodoMesCivil
} from '../../packages/contracts/src/recorte.js';
import { extrairDiagnosticoDeCancelamento } from '../../apps/api/src/modules/cancelamentos/heuristica.js';
import { classificarAtendimentoComIa } from '../../apps/api/src/modules/cancelamentos/openrouter.js';
import { parseAppConfig } from '../../apps/api/src/plugins/config.js';

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

test('Casca e permissões por papel para cancelamentos', async () => {
  // 1. Áreas da casca
  const areasAdmin = areasDaCasca('Admin');
  const areasGestao = areasDaCasca('Gestão');
  const areasCurador = areasDaCasca('Curador');

  const cancelamentosAdmin = areasAdmin.find((a) => a.rota === '/cancelamentos');
  assert.ok(cancelamentosAdmin, 'Admin deve possuir /cancelamentos na casca');
  assert.equal(cancelamentosAdmin.rotulo, 'Cancelamentos');
  assert.equal(cancelamentosAdmin.titulo, 'Diagnóstico de Cancelamentos');

  const cancelamentosGestao = areasGestao.find((a) => a.rota === '/cancelamentos');
  assert.ok(cancelamentosGestao, 'Gestão deve possuir /cancelamentos na casca');
  assert.equal(cancelamentosGestao.rotulo, 'Cancelamentos');
  assert.equal(cancelamentosGestao.titulo, 'Diagnóstico de Cancelamentos');

  const cancelamentosCurador = areasCurador.find((a) => a.rota === '/cancelamentos');
  assert.equal(cancelamentosCurador, undefined, 'Curador não deve possuir /cancelamentos na casca');

  // 2. Proteção HTTP das rotas de cancelamento
  const app = await buildApp();
  const { inicio, fim } = periodoMesCivil(new Date());
  const queryPadrao = `administradora=Affix&agente=affix-0800&inicio=${inicio}&fim=${fim}`;

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    // GET /api/cancelamentos
    // Sem autenticação: 401
    const getSemAuth = await app.inject({
      method: 'GET',
      url: `/api/cancelamentos?${queryPadrao}`
    });
    assert.equal(getSemAuth.statusCode, 401);

    // Curador: 403
    const getCurador = await app.inject({
      method: 'GET',
      url: `/api/cancelamentos?${queryPadrao}`,
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(getCurador.statusCode, 403);

    // Gestão: 200 e Cache-Control no-store
    const getGestao = await app.inject({
      method: 'GET',
      url: `/api/cancelamentos?${queryPadrao}`,
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(getGestao.statusCode, 200);
    assert.equal(getGestao.headers['cache-control'], 'no-store');
    assert.ok(painelDeCancelamentosResponseSchema.safeParse(getGestao.json()).success);

    // Admin: 200
    const getAdmin = await app.inject({
      method: 'GET',
      url: `/api/cancelamentos?${queryPadrao}`,
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(getAdmin.statusCode, 200);
    assert.ok(painelDeCancelamentosResponseSchema.safeParse(getAdmin.json()).success);

    // POST /api/cancelamentos/pesquisa-ia
    const payloadPesquisa = {
      pergunta: 'Quem cancelou e foi para a Hapvida? O problema é venda mal feita?',
      administradora: 'Affix',
      agente: 'affix-0800',
      inicio,
      fim
    };

    // Sem autenticação: 401
    const postSemAuth = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      payload: payloadPesquisa
    });
    assert.equal(postSemAuth.statusCode, 401);

    // Curador: 403
    const postCurador = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: payloadPesquisa
    });
    assert.equal(postCurador.statusCode, 403);

    // Gestão: 200
    const postGestao = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessaoGestao}` },
      payload: payloadPesquisa
    });
    assert.equal(postGestao.statusCode, 200);
    assert.ok(pesquisaIaCancelamentoResponseSchema.safeParse(postGestao.json()).success);

    // Admin: 200
    const postAdmin = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: payloadPesquisa
    });
    assert.equal(postAdmin.statusCode, 200);
    assert.ok(pesquisaIaCancelamentoResponseSchema.safeParse(postAdmin.json()).success);

    // POST /api/cancelamentos/analisar-passivo
    const payloadPassivo = {
      administradora: 'Affix',
      agente: 'affix-0800',
      inicio,
      fim
    };

    // Sem autenticação: 401
    const passivoSemAuth = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      payload: payloadPassivo
    });
    assert.equal(passivoSemAuth.statusCode, 401);

    // Curador: 403
    const passivoCurador = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: payloadPassivo
    });
    assert.equal(passivoCurador.statusCode, 403);

    // Gestão: 403 (apenas Admin pode acionar análise de passivo)
    const passivoGestao = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      headers: { authorization: `Bearer ${sessaoGestao}` },
      payload: payloadPassivo
    });
    assert.equal(passivoGestao.statusCode, 403);

    // Admin: 200
    const passivoAdmin = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: payloadPassivo
    });
    assert.equal(passivoAdmin.statusCode, 200);
    const passivoJson = passivoAdmin.json();
    assert.ok(analisarPassivoResponseSchema.safeParse(passivoJson).success);
    assert.equal(typeof passivoJson.analisados, 'number');
    assert.equal(typeof passivoJson.cancelamentosDetectados, 'number');
  } finally {
    await app.close();
  }
});

test('Detecção heurística de cancelamento, concorrente Hapvida e venda mal feita', () => {
  // Caso 1: Motivo inicial é Carência, mas o cliente declara cancelamento, migração para a Hapvida e venda mal feita
  const diag1 = extrairDiagnosticoDeCancelamento({
    motivo: 'Carência',
    transcricao: [
      {
        locutor: 'Agente de Voz',
        quando: '0:04',
        texto: 'Olá, em que posso ajudar?'
      },
      {
        locutor: 'Cliente',
        quando: '0:12',
        texto:
          'O corretor me prometeu na contratação carência zero, mas quando precisei me disseram que não posso usar. Foi uma venda mal feita e propaganda enganosa. Já cancelei e migrei para a Hapvida.'
      }
    ]
  });

  assert.equal(diag1.houveIntencaoCancelamento, true);
  assert.equal(diag1.concorrenteCitado, 'Hapvida');
  assert.equal(diag1.vendaMalFeita, true);
  assert.equal(diag1.origem, 'heuristica');
  assert.ok(diag1.diagnostico && diag1.diagnostico.includes('Hapvida'));
  assert.ok(diag1.evidenciaTrecho && diag1.evidenciaTrecho.includes('Hapvida'));

  // Caso 2: Motivo inicial é Reajuste, vendedor mentiu sobre valor fixo, cliente migrou
  const diag2 = extrairDiagnosticoDeCancelamento({
    motivo: 'Reajuste',
    transcricao: [
      {
        locutor: 'Cliente',
        quando: '0:10',
        texto:
          'O vendedor prometeu que o valor ficaria congelado por um ano. Veio esse aumento abusivo. Essa venda foi enganosa. Já estou cancelando e vou para a Unimed.'
      }
    ]
  });

  assert.equal(diag2.houveIntencaoCancelamento, true);
  assert.equal(diag2.concorrenteCitado, 'Unimed');
  assert.equal(diag2.vendaMalFeita, true);
  assert.equal(diag2.categoriaCausa, 'Preço / Reajuste');

  // Caso 3: Atendimento sem nenhuma intenção de cancelamento
  const diag3 = extrairDiagnosticoDeCancelamento({
    motivo: 'Boleto',
    transcricao: [
      {
        locutor: 'Cliente',
        quando: '0:08',
        texto: 'Gostaria de solicitar a segunda via do boleto deste mês para efetuar o pagamento.'
      }
    ]
  });

  assert.equal(diag3.houveIntencaoCancelamento, false);
  assert.equal(diag3.concorrenteCitado, null);
  assert.equal(diag3.vendaMalFeita, false);
  assert.equal(diag3.categoriaCausa, null);
});

test('KPIs, agrupamentos e filtros da listagem de cancelamentos refletem Recorte e Período', async () => {
  const app = await buildApp();
  const { inicio, fim } = periodoMesCivil(new Date());
  const urlBase = `/api/cancelamentos?administradora=Affix&agente=affix-0800&inicio=${inicio}&fim=${fim}`;

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');

    // Consulta Affix -> Clara Affix 0800 (contém a1: cancelamento Hapvida + venda mal feita)
    const resAffix = await app.inject({
      method: 'GET',
      url: urlBase,
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(resAffix.statusCode, 200);
    const dados = painelDeCancelamentosResponseSchema.parse(resAffix.json());

    // KPIs
    assert.ok(dados.kpis.totalCancelamentos >= 1);
    assert.ok(dados.kpis.totalVendaMalFeita >= 1);
    assert.ok(dados.kpis.totalConcorrencia >= 1);
    assert.equal(dados.kpis.principalConcorrente, 'Hapvida');

    // Agrupamentos porConcorrente e porCausa
    const grupoHapvida = dados.porConcorrente.find((c) => c.concorrente === 'Hapvida');
    assert.ok(grupoHapvida, 'Deveria existir Hapvida no agrupamento porConcorrente');
    assert.ok(grupoHapvida.quantidade >= 1);
    assert.ok(grupoHapvida.vendaMalFeitaCount >= 1);

    const causaPresente = dados.porCausa.find((c) => c.quantidade > 0);
    assert.ok(causaPresente, 'Deveria haver pelo menos uma causa identificada');

    // Filtros da listagem:
    // Filtro concorrente=Hapvida deve retornar o atendimento a1
    const resConcorrenteHapvida = await app.inject({
      method: 'GET',
      url: `${urlBase}&concorrente=Hapvida`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensHapvida = painelDeCancelamentosResponseSchema.parse(resConcorrenteHapvida.json()).itens;
    assert.ok(itensHapvida.some((i) => i.id === 'a1'));

    // Filtro concorrente inexistente não deve retornar a1
    const resConcorrenteInexistente = await app.inject({
      method: 'GET',
      url: `${urlBase}&concorrente=ConcorrenteInexistente`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensInexistente = painelDeCancelamentosResponseSchema.parse(resConcorrenteInexistente.json()).itens;
    assert.equal(itensInexistente.length, 0);

    // Filtro vendaMalFeita=sim deve incluir a1
    const resVendaSim = await app.inject({
      method: 'GET',
      url: `${urlBase}&vendaMalFeita=sim`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensVendaSim = painelDeCancelamentosResponseSchema.parse(resVendaSim.json()).itens;
    assert.ok(itensVendaSim.some((i) => i.id === 'a1'));

    // Filtro vendaMalFeita=nao deve excluir a1
    const resVendaNao = await app.inject({
      method: 'GET',
      url: `${urlBase}&vendaMalFeita=nao`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensVendaNao = painelDeCancelamentosResponseSchema.parse(resVendaNao.json()).itens;
    assert.equal(itensVendaNao.some((i) => i.id === 'a1'), false);

    // Filtro causa compatível com a1 ('Rede credenciada / Cobertura')
    const resCausaCerta = await app.inject({
      method: 'GET',
      url: `${urlBase}&causa=${encodeURIComponent('Rede credenciada / Cobertura')}`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensCausaCerta = painelDeCancelamentosResponseSchema.parse(resCausaCerta.json()).itens;
    assert.ok(itensCausaCerta.some((i) => i.id === 'a1'));

    // Filtro causa divergente de a1 ('Problema financeiro / Boleto')
    const resCausaDivergente = await app.inject({
      method: 'GET',
      url: `${urlBase}&causa=${encodeURIComponent('Problema financeiro / Boleto')}`,
      headers: { authorization: `Bearer ${sessao}` }
    });
    const itensCausaDivergente = painelDeCancelamentosResponseSchema.parse(resCausaDivergente.json()).itens;
    assert.equal(itensCausaDivergente.some((i) => i.id === 'a1'), false);
  } finally {
    await app.close();
  }
});

test('Pesquisa por IA responde pergunta com síntese e evidências (Fallback Analítico Local)', async () => {
  const app = await buildApp();
  const { inicio, fim } = periodoMesCivil(new Date());

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        pergunta: 'Quem cancelou e foi para a Hapvida? O problema é venda mal feita?',
        administradora: 'Affix',
        agente: 'affix-0800',
        inicio,
        fim
      }
    });

    assert.equal(response.statusCode, 200);
    const resultado = pesquisaIaCancelamentoResponseSchema.parse(response.json());

    assert.equal(resultado.fonte, 'analitico-local');
    assert.match(resultado.resposta, /Hapvida/i);
    assert.match(resultado.resposta, /venda mal feita/i);

    // Evidências apontam para o atendimento a1
    assert.ok(resultado.evidencias.length >= 1);
    const evHapvida = resultado.evidencias.find((e) => e.id === 'a1');
    assert.ok(evHapvida, 'Evidência a1 deve estar presente');
    assert.equal(evHapvida.concorrenteCitado, 'Hapvida');
    assert.equal(evHapvida.vendaMalFeita, true);
    assert.ok(evHapvida.diagnostico && evHapvida.diagnostico.includes('Hapvida'));
  } finally {
    await app.close();
  }
});

test('Pesquisa por IA integra com cliente OpenRouter simulado via mock de rede', async () => {
  const chaveOriginal = process.env.OPENROUTER_API_KEY;
  const fetchOriginal = globalThis.fetch;
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  try {
    process.env.OPENROUTER_API_KEY = 'sk-or-test-mock-key';

    let fetchChamado = false;
    let authHeaderRecebido: string | null = null;
    let bodyEnviado: { model?: string } | null = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchChamado = true;
      const headers = new Headers(init?.headers);
      authHeaderRecebido = headers.get('authorization');
      if (init?.body) {
        bodyEnviado = JSON.parse(init.body.toString());
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  resposta:
                    'Identificamos cancelamento com migração para a Hapvida motivado por venda mal feita e promessa de rede não cumprida.',
                  evidenciaIds: ['a1']
                })
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    app = await buildApp();
    const { inicio, fim } = periodoMesCivil(new Date());
    const sessao = await sessaoDe(app, 'bruno.alves@crion');

    const response = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        pergunta: 'Quem cancelou e foi para a Hapvida? O problema é venda mal feita?',
        administradora: 'Affix',
        agente: 'affix-0800',
        inicio,
        fim
      }
    });

    assert.equal(response.statusCode, 200);
    const resultado = pesquisaIaCancelamentoResponseSchema.parse(response.json());

    assert.equal(fetchChamado, true, 'fetch do OpenRouter deveria ter sido chamado');
    assert.equal(authHeaderRecebido, 'Bearer sk-or-test-mock-key');
    assert.equal((bodyEnviado as { model?: string } | null)?.model, 'deepseek/deepseek-v4.1-flash');
    assert.equal(resultado.fonte, 'openrouter');
    assert.match(resultado.resposta, /Hapvida/i);
    assert.equal(resultado.evidencias[0]?.id, 'a1');
  } finally {
    if (app) {
      await app.close();
    }
    globalThis.fetch = fetchOriginal;
    if (chaveOriginal === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = chaveOriginal;
    }
  }
});

test('Persistência e detalhe do Atendimento com Diagnóstico de Cancelamento', async () => {
  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');

    // PUT /api/atendimentos/a3/avaliacao-ia grava diagnosticoCancelamento
    const gravacao = await app.inject({
      method: 'PUT',
      url: '/api/atendimentos/a3/avaliacao-ia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        nota: 6.5,
        criterios: [
          { nome: 'Resolução da demanda', estado: 'Atendido', pontos: 1.5, critico: true },
          { nome: 'Clareza e objetividade', estado: 'Atendido', pontos: 1.5, critico: false }
        ],
        resumo: 'Cliente solicitou cancelamento após divergência com promessa do corretor',
        falhasIdentificadas: ['Promessa comercial divergente'],
        diagnosticoCancelamento: {
          houveIntencaoCancelamento: true,
          categoriaCausa: 'Venda mal feita / Divergência comercial',
          vendaMalFeita: true,
          concorrenteCitado: 'Hapvida',
          diagnostico: 'Cliente cancelou e declarou migração para a Hapvida devido a venda mal feita.',
          evidenciaTrecho: 'O corretor disse que o hospital cobria tudo, cancelei e fui para a Hapvida.',
          origem: 'ia'
        }
      }
    });

    assert.equal(gravacao.statusCode, 200);
    const detalheGravado = atendimentoDetalheSchema.parse(gravacao.json());
    assert.ok(detalheGravado.avaliacaoDaIa?.diagnosticoCancelamento);
    assert.equal(
      detalheGravado.avaliacaoDaIa.diagnosticoCancelamento.houveIntencaoCancelamento,
      true
    );
    assert.equal(
      detalheGravado.avaliacaoDaIa.diagnosticoCancelamento.concorrenteCitado,
      'Hapvida'
    );
    assert.equal(
      detalheGravado.avaliacaoDaIa.diagnosticoCancelamento.vendaMalFeita,
      true
    );
    assert.equal(
      detalheGravado.avaliacaoDaIa.diagnosticoCancelamento.categoriaCausa,
      'Venda mal feita / Divergência comercial'
    );

    // GET /api/atendimentos/a3 com Gestão lê o diagnóstico gravado
    const consultaGestao = await app.inject({
      method: 'GET',
      url: '/api/atendimentos/a3',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });

    assert.equal(consultaGestao.statusCode, 200);
    const detalheLido = atendimentoDetalheSchema.parse(consultaGestao.json());
    const diagLido = detalheLido.avaliacaoDaIa?.diagnosticoCancelamento;

    assert.ok(diagLido, 'diagnosticoCancelamento deve estar presente no detalhe lido');
    assert.equal(diagLido.houveIntencaoCancelamento, true);
    assert.equal(diagLido.concorrenteCitado, 'Hapvida');
    assert.equal(diagLido.vendaMalFeita, true);
    assert.equal(diagLido.categoriaCausa, 'Venda mal feita / Divergência comercial');
    assert.equal(
      diagLido.diagnostico,
      'Cliente cancelou e declarou migração para a Hapvida devido a venda mal feita.'
    );
    assert.equal(
      diagLido.evidenciaTrecho,
      'O corretor disse que o hospital cobria tudo, cancelei e fui para a Hapvida.'
    );
    assert.equal(diagLido.origem, 'ia');

    // Quando a IA persiste houveIntencaoCancelamento: false, a heurística não sobrescreve o veredito da IA
    const gravacaoFalsa = await app.inject({
      method: 'PUT',
      url: '/api/atendimentos/a1/avaliacao-ia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        nota: 8.5,
        criterios: [
          { nome: 'Resolução da demanda', estado: 'Atendido', pontos: 1.5, critico: true }
        ],
        resumo: 'Cliente mencionou Hapvida mas decidiu permanecer no plano após esclarecimento.',
        falhasIdentificadas: [],
        diagnosticoCancelamento: {
          houveIntencaoCancelamento: false,
          origem: 'ia'
        }
      }
    });
    assert.equal(gravacaoFalsa.statusCode, 200);
    const detalheSemCancelamento = atendimentoDetalheSchema.parse(gravacaoFalsa.json());
    assert.equal(
      detalheSemCancelamento.avaliacaoDaIa?.diagnosticoCancelamento,
      undefined,
      'Veredito negativo da IA deve ter precedência sobre a heurística'
    );
  } finally {
    await app.close();
  }
});

test('Recorte, período do Dashboard, idempotência do passivo e validação de categoria LLM em cancelamentos', async () => {
  // 1. /cancelamentos preserva Recorte no badge e no voltar à lista
  assert.equal(
    destinoDaLista({ administradora: 'Affix', agente: 'affix-0800' }, '/cancelamentos'),
    '/cancelamentos?administradora=Affix&agente=affix-0800'
  );
  assert.equal(
    destinoDoBadge('Affix', '/cancelamentos'),
    '/cancelamentos?administradora=Affix'
  );

  const app = await buildApp();
  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');

    // 2. Sem datas informadas, GET /api/cancelamentos aplica o período do Dashboard (dia 1 até hoje)
    const semDatas = await app.inject({
      method: 'GET',
      url: '/api/cancelamentos?administradora=Affix',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(semDatas.statusCode, 200);
    const painelSemDatas = painelDeCancelamentosResponseSchema.parse(semDatas.json());
    assert.deepEqual(painelSemDatas.periodo, periodoAteHoje(new Date()));
    // a4 está 'Em andamento' em Affix; apenas concluídos entram em totalAtendimentos (a1)
    assert.equal(
      painelSemDatas.itens.every((item) => item.status === 'Concluído'),
      true
    );

    // 3. Período inválido retorna 400 com erro: 'periodo' nos três endpoints
    const getPeriodoInvalido = await app.inject({
      method: 'GET',
      url: '/api/cancelamentos?inicio=2026-10-20&fim=2026-10-01',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(getPeriodoInvalido.statusCode, 400);
    assert.equal(getPeriodoInvalido.json().erro, 'periodo');

    const postPesquisaInvalida = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/pesquisa-ia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        pergunta: 'Qual o padrão?',
        inicio: '2026-10-20',
        fim: '2026-10-01'
      }
    });
    assert.equal(postPesquisaInvalida.statusCode, 400);
    assert.equal(postPesquisaInvalida.json().erro, 'periodo');

    // 4. Analisar passivo processa registros ainda sem diagnóstico IA e não reprocessa na segunda chamada
    const { inicio, fim } = periodoMesCivil(new Date());
    const passivo1 = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: { administradora: 'Affix', agente: 'affix-0800', inicio, fim }
    });
    assert.equal(passivo1.statusCode, 200);
    assert.equal(passivo1.json().analisados, 1);

    const passivo2 = await app.inject({
      method: 'POST',
      url: '/api/cancelamentos/analisar-passivo',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: { administradora: 'Affix', agente: 'affix-0800', inicio, fim }
    });
    assert.equal(passivo2.statusCode, 200);
    assert.equal(passivo2.json().analisados, 0);
  } finally {
    await app.close();
  }

  // 5. classificarAtendimentoComIa sanitiza categoriaCausa fora do enum canônico para 'Outros'
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  houveIntencaoCancelamento: true,
                  categoriaCausa: 'Categoria inventada pelo LLM',
                  vendaMalFeita: true,
                  concorrenteCitado: 'Hapvida',
                  diagnostico: 'Cancelou e foi para a Hapvida.',
                  evidenciaTrecho: 'Vou para a Hapvida'
                })
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const classificado = await classificarAtendimentoComIa({
      atendimento: {
        id: 'x1',
        administradora: 'Affix',
        agente: 'Clara Affix 0800',
        agenteId: 'affix-0800',
        iniciadoEm: '2026-10-11T09:00:00-03:00',
        motivo: 'Carência',
        nota: 8,
        notaIa: 8,
        notaCurador: null,
        status: 'Concluído',
        curadoria: false,
        conversa: 'conv-x1',
        transcricao: [{ locutor: 'Cliente', quando: '0:05', texto: 'Vou para a Hapvida' }]
      },
      config: parseAppConfig({
        NODE_ENV: 'test',
        OPENROUTER_API_KEY: 'sk-or-test'
      })
    });

    assert.equal(classificado.categoriaCausa, 'Outros');
    assert.equal(classificado.origem, 'ia');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
