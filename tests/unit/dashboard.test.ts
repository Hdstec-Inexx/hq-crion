import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../apps/api/src/app.js';
import { areasDaCasca, destinoDaNavegacao } from '../../packages/contracts/src/casca.js';
import {
  dashboardResponseSchema,
  fraseDoHoverDeAcertoPorCriterio,
  fraseDoHoverDeConcordanciaPorCriterio
} from '../../packages/contracts/src/dashboard.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { destinoDoKpi, destinoDoPainel } from '../../packages/contracts/src/recorte.js';
import { reguaDeAvaliacaoSchema } from '../../packages/contracts/src/regua.js';

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

function kpi(
  body: ReturnType<typeof dashboardResponseSchema.parse>,
  id: string
) {
  const encontrado = body.kpis.find((item) => item.id === id);
  assert.ok(encontrado, `KPI ${id} ausente`);
  return encontrado;
}

test('deep link do KPI bate com a query da lista', () => {
  assert.equal(
    destinoDoKpi({ administradora: 'Affix', agente: 'affix-0800' }),
    '/atendimentos?administradora=Affix&agente=affix-0800'
  );
  assert.equal(
    destinoDoKpi({ administradora: 'Alter', agente: null }),
    '/atendimentos?administradora=Alter'
  );
  assert.equal(destinoDoKpi({ administradora: null, agente: null }), '/atendimentos');
});

test('KPI com período leva o mesmo intervalo para a lista', () => {
  assert.equal(
    destinoDoKpi(
      { administradora: 'Affix', agente: null },
      { inicio: '2026-09-01', fim: '2026-09-30' }
    ),
    '/atendimentos?administradora=Affix&inicio=2026-09-01&fim=2026-09-30'
  );
});

test('KPI e painel levam Recorte, período e indicador para a lista', () => {
  assert.equal(
    destinoDoKpi(
      { administradora: 'Affix', agente: 'affix-0800' },
      { inicio: '2026-09-01', fim: '2026-09-30' },
      'sla'
    ),
    '/atendimentos?administradora=Affix&agente=affix-0800&inicio=2026-09-01&fim=2026-09-30&indicador=sla'
  );
  assert.equal(
    destinoDoPainel(
      { administradora: 'Alter', agente: null },
      { inicio: '2026-09-01', fim: '2026-09-30' },
      'motivos'
    ),
    '/atendimentos?administradora=Alter&inicio=2026-09-01&fim=2026-09-30&indicador=motivos'
  );
  assert.equal(
    destinoDoPainel(
      { administradora: 'Alter', agente: null },
      { inicio: '2026-09-01', fim: '2026-09-30' },
      'motivos',
      { motivo: 'Boleto' }
    ),
    '/atendimentos?administradora=Alter&inicio=2026-09-01&fim=2026-09-30&indicador=motivos&motivo=Boleto'
  );
  assert.equal(
    destinoDoPainel(
      { administradora: 'Affix', agente: null },
      { inicio: '2026-09-01', fim: '2026-09-30' },
      'naoConformidade',
      { criteriosNaoAtendidos: 'Informação de Protocolo' }
    ),
    '/atendimentos?administradora=Affix&inicio=2026-09-01&fim=2026-09-30&indicador=naoConformidade&criteriosNaoAtendidos=Informa%C3%A7%C3%A3o+de+Protocolo'
  );
});

test('casca da Gestão e do Admin abre Dashboard consolidado, sem Recorte na rota', () => {
  const gestao = areasDaCasca('Gestão').find((area) => area.rota === '/dashboard');
  const admin = areasDaCasca('Admin').find((area) => area.rota === '/dashboard');
  assert.equal(gestao?.rota, '/dashboard');
  assert.equal(gestao?.titulo, 'Dashboard');
  assert.equal(admin?.rota, '/dashboard');
  assert.equal(admin?.titulo, 'Dashboard');
});

test('Curador não tem Dashboard na casca e é recusado na rota', () => {
  assert.equal(
    areasDaCasca('Curador').some((area) => area.rota === '/dashboard'),
    false
  );
  assert.equal(
    destinoDaNavegacao({ perfil: { papel: 'Curador' }, pathname: '/dashboard' }),
    '/atendimentos'
  );
});

test('GET /dashboard sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/dashboard' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('GET /dashboard recusa Curador', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('GET /dashboard rejeita par Administradora + Agente inválido', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('agregados do Dashboard respeitam Recorte e batem com a lista', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const recorte = 'administradora=Affix&agente=affix-0800';
    const dashboard = await app.inject({
      method: 'GET',
      url: `/dashboard?${recorte}`,
      headers
    });
    const lista = await app.inject({
      method: 'GET',
      url: `/atendimentos?${recorte}`,
      headers
    });

    assert.equal(dashboard.statusCode, 200);
    const body = dashboardResponseSchema.parse(dashboard.json());
    assert.deepEqual(body.recorte, {
      administradora: 'Affix',
      agente: 'affix-0800'
    });
    assert.equal(kpi(body, 'atendimentos').valor, lista.json().total);
    assert.equal(kpi(body, 'notaMediaIa').valor, 8.5);
    assert.equal(kpi(body, 'aprovacao').valor, 100);
    assert.equal(destinoDoKpi(body.recorte), `/atendimentos?${recorte}`);
  } finally {
    await app.close();
  }
});

test('sem Recorte o Dashboard soma todas as Claras do período', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const dashboard = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers
    });
    const lista = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers
    });

    assert.equal(dashboard.statusCode, 200);
    const body = dashboardResponseSchema.parse(dashboard.json());
    assert.deepEqual(body.recorte, { administradora: null, agente: null });
    assert.equal(kpi(body, 'atendimentos').valor, lista.json().total);
    assert.ok((kpi(body, 'atendimentos').valor ?? 0) > 1);
    assert.equal(destinoDoKpi(body.recorte), '/atendimentos');
  } finally {
    await app.close();
  }
});

test('período submetido recorta agregados e o deep link do KPI', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const query = 'administradora=Affix&inicio=2020-01-01&fim=2020-01-31';
    const dashboard = await app.inject({
      method: 'GET',
      url: `/dashboard?${query}`,
      headers
    });
    const lista = await app.inject({
      method: 'GET',
      url: `/atendimentos?${query}`,
      headers
    });

    assert.equal(dashboard.statusCode, 200);
    const body = dashboardResponseSchema.parse(dashboard.json());
    assert.deepEqual(body.periodo, { inicio: '2020-01-01', fim: '2020-01-31' });
    assert.equal(kpi(body, 'atendimentos').valor, lista.json().total);
    assert.equal(kpi(body, 'atendimentos').valor, 1);
    assert.equal(kpi(body, 'notaMediaIa').valor, 5);
    assert.equal(
      destinoDoKpi(body.recorte, body.periodo),
      `/atendimentos?${query}`
    );
  } finally {
    await app.close();
  }
});

test('filtros da listagem não entram no agregado do Dashboard', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const dashboard = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers
    });
    const comFiltroDaLista = await app.inject({
      method: 'GET',
      url: '/dashboard?status=Em%20andamento',
      headers
    });

    assert.equal(dashboard.statusCode, 200);
    const semFiltro = dashboardResponseSchema.parse(dashboard.json());
    const comFiltro = dashboardResponseSchema.parse(comFiltroDaLista.json());
    assert.deepEqual(semFiltro.kpis, comFiltro.kpis);
    assert.deepEqual(semFiltro.paineis, comFiltro.paineis);
  } finally {
    await app.close();
  }
});

test('aprovação do Dashboard usa o limiar da Régua única', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const recorte = 'administradora=Affix';
    const regua = await app.inject({
      method: 'GET',
      url: '/regua',
      headers
    });
    const dashboard = await app.inject({
      method: 'GET',
      url: `/dashboard?${recorte}`,
      headers
    });
    const lista = await app.inject({
      method: 'GET',
      url: `/atendimentos?${recorte}`,
      headers
    });

    const limiar = reguaDeAvaliacaoSchema.parse(regua.json()).limiarDeAprovacao;
    const itens = lista.json().itens as { nota: number }[];
    const esperada = (itens.filter((item) => item.nota >= limiar).length / itens.length) * 100;
    const body = dashboardResponseSchema.parse(dashboard.json());

    assert.equal(kpi(body, 'aprovacao').valor, esperada);
    assert.equal(kpi(body, 'atendimentos').valor, lista.json().total);
  } finally {
    await app.close();
  }
});

test('pulso do Dashboard traz TMA, resolvidas, SLA e nulos sem fato', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const comFato = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Affix&agente=affix-0800',
      headers
    });
    const semConclusao = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Affix&agente=affix-wa',
      headers
    });
    const esperaForaDoSla = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Affix&inicio=2020-01-01&fim=2020-01-31',
      headers
    });

    const comFatoBody = dashboardResponseSchema.parse(comFato.json());
    const semConclusaoBody = dashboardResponseSchema.parse(semConclusao.json());
    const esperaForaBody = dashboardResponseSchema.parse(esperaForaDoSla.json());

    assert.equal(kpi(comFatoBody, 'tma').valor, 312);
    assert.equal(kpi(comFatoBody, 'taxaDeResolvidas').valor, 100);
    assert.equal(kpi(comFatoBody, 'sla').valor, 100);
    assert.equal(kpi(comFatoBody, 'sla').meta, 80);
    assert.equal(kpi(comFatoBody, 'sla').limiarEmSegundos, 150);
    assert.equal(kpi(comFatoBody, 'notaMediaIa').rotulo, 'Nota média IA Avaliadora');
    assert.equal(kpi(comFatoBody, 'avaliadosIa').rotulo, 'Avaliados IA Avaliadora');
    assert.equal(kpi(comFatoBody, 'promessasCumpridas').rotulo, 'Taxa de Promessas Cumpridas');
    assert.equal(kpi(comFatoBody, 'promessasCumpridas').valor, (2 / 3) * 100);
    assert.equal(kpi(comFatoBody, 'tempoMedioAteResolucao').valor, 312);
    assert.equal(kpi(comFatoBody, 'avaliadosIa').valor, 1);
    assert.equal(kpi(comFatoBody, 'avaliadosCurador').valor, 0);
    assert.equal(kpi(comFatoBody, 'notaMediaCurador').valor, null);

    assert.equal(kpi(semConclusaoBody, 'atendimentos').valor, 1);
    assert.equal(kpi(semConclusaoBody, 'tma').valor, null);
    assert.equal(kpi(semConclusaoBody, 'taxaDeResolvidas').valor, null);
    assert.equal(kpi(semConclusaoBody, 'sla').valor, null);
    assert.equal(kpi(semConclusaoBody, 'promessasCumpridas').valor, null);
    assert.equal(kpi(semConclusaoBody, 'tempoMedioAteResolucao').valor, null);

    assert.equal(kpi(esperaForaBody, 'sla').valor, 0);
    assert.equal(kpi(esperaForaBody, 'tma').valor, 150);
  } finally {
    await app.close();
  }
});

test('painéis do Dashboard descrevem motivos, critérios e piores Atendimentos', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const headers = { authorization: `Bearer ${sessao}` };
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Alter',
      headers
    });
    const body = dashboardResponseSchema.parse(response.json());

    assert.deepEqual(body.paineis.motivos, [{ motivo: 'Boleto', quantidade: 1 }]);
    assert.equal(
      body.paineis.naoConformidade.find((item) => item.criterio === 'Informação de Protocolo')
        ?.quantidade,
      1
    );
    assert.equal(body.paineis.concordancia.nota, 100);
    assert.equal(body.paineis.pioresAtendimentos[0]?.id, 'a2');
    assert.equal(
      body.paineis.acertoPorCriterio.find((item) => item.criterio === 'Validação de e-mail')
        ?.percentual,
      null
    );
  } finally {
    await app.close();
  }
});

test('Acerto por Critério expõe atendidos e aplicáveis consistentes com o percentual', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Alter',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const body = dashboardResponseSchema.parse(response.json());
    const email = body.paineis.acertoPorCriterio.find(
      (item) => item.criterio === 'Validação de e-mail'
    );
    const protocolo = body.paineis.acertoPorCriterio.find(
      (item) => item.criterio === 'Informação de Protocolo'
    );
    const saudacao = body.paineis.acertoPorCriterio.find(
      (item) => item.criterio === 'Saudação'
    );

    assert.equal(email?.percentual, null);
    assert.equal(email?.atendidos, 0);
    assert.equal(email?.aplicaveis, 0);
    assert.equal(protocolo?.percentual, 0);
    assert.equal(protocolo?.atendidos, 0);
    assert.equal(protocolo?.aplicaveis, 1);
    assert.equal(saudacao?.percentual, 100);
    assert.equal(saudacao?.atendidos, 1);
    assert.equal(saudacao?.aplicaveis, 1);

    for (const linha of body.paineis.acertoPorCriterio) {
      if (linha.percentual === null) {
        assert.equal(linha.atendidos, 0);
        assert.equal(linha.aplicaveis, 0);
      } else {
        assert.equal(linha.percentual, (linha.atendidos / linha.aplicaveis) * 100);
      }
    }
  } finally {
    await app.close();
  }
});

test('Concordância por Critério expõe iguais e comparáveis consistentes com o percentual', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard?administradora=Alter',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const body = dashboardResponseSchema.parse(response.json());
    const email = body.paineis.concordancia.porCriterio.find(
      (item) => item.criterio === 'Validação de e-mail'
    );
    const protocolo = body.paineis.concordancia.porCriterio.find(
      (item) => item.criterio === 'Informação de Protocolo'
    );

    assert.equal(email?.percentual, null);
    assert.equal(email?.iguais, 0);
    assert.equal(email?.comparaveis, 0);
    assert.equal(protocolo?.percentual, 100);
    assert.equal(protocolo?.iguais, 1);
    assert.equal(protocolo?.comparaveis, 1);

    for (const linha of body.paineis.concordancia.porCriterio) {
      if (linha.percentual === null) {
        assert.equal(linha.iguais, 0);
        assert.equal(linha.comparaveis, 0);
      } else {
        assert.equal(linha.percentual, (linha.iguais / linha.comparaveis) * 100);
      }
    }
  } finally {
    await app.close();
  }
});

test('barra de Acerto recorta Critérios Atendidos e Concordância não leva Critério extra', () => {
  const recorte = { administradora: 'Affix' as const, agente: null };
  const periodo = { inicio: '2026-09-01', fim: '2026-09-30' };

  assert.equal(
    destinoDoPainel(recorte, periodo, 'acertoPorCriterio', {
      criteriosAtendidos: 'Saudação'
    }),
    '/atendimentos?administradora=Affix&inicio=2026-09-01&fim=2026-09-30&indicador=acertoPorCriterio&criteriosAtendidos=Sauda%C3%A7%C3%A3o'
  );
  assert.equal(
    destinoDoPainel(recorte, periodo, 'concordancia'),
    '/atendimentos?administradora=Affix&inicio=2026-09-01&fim=2026-09-30&indicador=concordancia'
  );
});

test('frases de hover das barras nomeiam a base e nunca dizem 0 sem aplicáveis ou comparáveis', () => {
  assert.equal(
    fraseDoHoverDeAcertoPorCriterio({ percentual: 80, atendidos: 4, aplicaveis: 5 }),
    '4 atendidos · 5 aplicáveis'
  );
  assert.equal(
    fraseDoHoverDeAcertoPorCriterio({ percentual: null, atendidos: 0, aplicaveis: 0 }),
    'nenhum aplicável'
  );
  assert.equal(
    fraseDoHoverDeConcordanciaPorCriterio({ percentual: (2 / 3) * 100, iguais: 2, comparaveis: 3 }),
    '2 iguais · 3 comparáveis'
  );
  assert.equal(
    fraseDoHoverDeConcordanciaPorCriterio({ percentual: null, iguais: 0, comparaveis: 0 }),
    'nenhum comparável'
  );
});

test('barra revela a frase no ponteiro e no foco, sem title que atrase o toque', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const barras = readFileSync(
    join(raiz, 'apps/web/src/features/dashboard/GraficoBarras.tsx'),
    'utf8'
  );
  const paineis = readFileSync(
    join(raiz, 'apps/web/src/features/dashboard/PaineisDoDashboard.tsx'),
    'utf8'
  );

  assert.match(barras, /onFocus=\{\(\) => setVisivel\(true\)\}/);
  assert.match(barras, /pointerType === 'mouse'/);
  assert.doesNotMatch(barras, /\btitle=/);
  assert.match(barras, /fraseDoHover/);
  assert.match(paineis, /criteriosAtendidos: criterio/);
  assert.match(paineis, /destinoDaBarra=\{\(\) => destino\('concordancia'\)\}/);
  assert.doesNotMatch(paineis, /dashboard-concordancia-resumo[\s\S]*title=/);
});
