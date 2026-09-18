import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import {
  caminhoDeMidiaPermitido,
  custoVisivelPara,
  downloadVisivelPara
} from '../../packages/contracts/src/atendimento.js';
import {
  destinoDaLista,
  destinoDoBadge,
  lerRecorte,
  periodoMesCivil,
  queryDoRecorte
} from '../../packages/contracts/src/recorte.js';
import {
  camposVisiveisDaListagem,
  limparFiltrosDaQuery,
  motivosDeContato,
  notaIaDaQuery
} from '../../packages/contracts/src/filtros-listagem.js';

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

test('mapa GEAP de filtros por página e motivo fechado', () => {
  assert.ok(motivosDeContato.includes('Não informado'));
  assert.equal(
    camposVisiveisDaListagem('/atendimentos').includes('statusAtendimento'),
    true
  );
  assert.equal(camposVisiveisDaListagem('/fila-de-curadoria').includes('curador'), false);
  assert.equal(camposVisiveisDaListagem('/fila-de-curadoria').includes('criterios'), false);
  assert.equal(camposVisiveisDaListagem('/minhas-curadorias').includes('curador'), false);
  assert.equal(camposVisiveisDaListagem('/curadorias-realizadas').includes('curador'), true);
  assert.equal(camposVisiveisDaListagem('/manutencao').includes('criterios'), false);
  assert.equal(
    limparFiltrosDaQuery(
      new URLSearchParams('administradora=Affix&motivo=Boleto&indicador=sla')
    ).get('administradora'),
    'Affix'
  );
  assert.equal(
    limparFiltrosDaQuery(
      new URLSearchParams('administradora=Affix&motivo=Boleto&indicador=sla')
    ).has('motivo'),
    false
  );
});

test('voltar à lista preserva Recorte na URL', () => {
  assert.equal(
    destinoDaLista({ administradora: 'Affix', agente: 'affix-0800' }),
    '/atendimentos?administradora=Affix&agente=affix-0800'
  );
  assert.equal(
    destinoDaLista({ administradora: 'Alter', agente: null }),
    '/atendimentos?administradora=Alter'
  );
  assert.equal(destinoDaLista({ administradora: null, agente: null }), '/atendimentos');
});

test('badge da Administradora recorta a lista atual sem Agente', () => {
  assert.equal(
    destinoDoBadge('Affix'),
    '/atendimentos?administradora=Affix'
  );
  assert.equal(
    destinoDoBadge('Alter', '/monitoramento'),
    '/monitoramento?administradora=Alter'
  );
});

test('query de Recorte faz round-trip entre URL e contrato', () => {
  const recorte = { administradora: 'Affix' as const, agente: 'affix-0800' };
  const query = queryDoRecorte(recorte);

  assert.equal(query.get('administradora'), 'Affix');
  assert.equal(query.has('admin'), false);
  assert.equal(query.get('agente'), 'affix-0800');
  assert.deepEqual(
    lerRecorte({ administradora: 'Affix', agente: 'affix-0800' }),
    recorte
  );
});

test('par Administradora + Agente inválido é rejeitado', () => {
  assert.throws(() =>
    lerRecorte({ administradora: 'Affix', agente: 'alter-1' })
  );
});

test('GET /atendimentos devolve o Recorte da query e filtra a lista', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Affix&agente=affix-0800',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(body.recorte, {
      administradora: 'Affix',
      agente: 'affix-0800'
    });
    assert.ok(body.itens.length > 0);
    for (const item of body.itens) {
      assert.equal(item.administradora, 'Affix');
      assert.equal(item.agenteId, 'affix-0800');
    }
  } finally {
    await app.close();
  }
});

test('GET /atendimentos rejeita par Administradora + Agente inválido', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('GET /atendimentos filtra por status', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?status=Em%20andamento',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = response.json().itens.map((item: { id: string }) => item.id);
    assert.deepEqual(ids, ['a4']);
  } finally {
    await app.close();
  }
});

test('notaIa da query é igualdade em degrau de 0,5 e 0 não recorta', () => {
  assert.equal(notaIaDaQuery(undefined), undefined);
  assert.equal(notaIaDaQuery('0'), undefined);
  assert.equal(notaIaDaQuery('7.5'), 7.5);
  assert.equal(notaIaDaQuery('7.3'), undefined);
  assert.equal(notaIaDaQuery('nao-e-nota'), undefined);
  assert.equal(notaIaDaQuery(['7.5', '8.5'] as unknown as string), undefined);
});

test('GET /atendimentos filtra por nota da IA', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const igualdade = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=7.5',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const zero = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=0',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const semParam = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const meioPonto = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=8.5',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const foraDoDegrau = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=7.3',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(igualdade.statusCode, 200);
    assert.deepEqual(
      igualdade.json().itens.map((item: { id: string }) => item.id),
      ['a4']
    );
    assert.equal(zero.statusCode, 200);
    assert.deepEqual(
      zero.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
    assert.equal(meioPonto.statusCode, 200);
    assert.deepEqual(
      meioPonto.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
    assert.equal(foraDoDegrau.statusCode, 200);
    assert.deepEqual(
      foraDoDegrau.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
  } finally {
    await app.close();
  }
});

test('GET /atendimentos ignora Motivo fora do conjunto fechado', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const semParam = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const foraDoConjunto = await app.inject({
      method: 'GET',
      url: '/atendimentos?motivo=invalido',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(foraDoConjunto.statusCode, 200);
    assert.deepEqual(
      foraDoConjunto.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
  } finally {
    await app.close();
  }
});

test('GET /atendimentos com indicador do pulso restringe a lista', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const avaliadosCurador = await app.inject({
      method: 'GET',
      url: '/atendimentos?indicador=avaliadosCurador',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const piores = await app.inject({
      method: 'GET',
      url: '/atendimentos?indicador=pioresAtendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(avaliadosCurador.statusCode, 200);
    assert.deepEqual(
      avaliadosCurador.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
    assert.equal(piores.statusCode, 200);
    const idsPiores = piores.json().itens.map((item: { id: string }) => item.id);
    assert.equal(idsPiores.length, 5);
    assert.equal(idsPiores[0], 'a2');
    assert.equal(idsPiores.includes('a1'), false);
  } finally {
    await app.close();
  }
});

test('GET /atendimentos combina Recorte, período e indicador do pulso', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const { inicio, fim } = periodoMesCivil(new Date());
    const response = await app.inject({
      method: 'GET',
      url: `/atendimentos?administradora=Alter&inicio=${inicio}&fim=${fim}&indicador=avaliadosCurador`,
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().recorte, {
      administradora: 'Alter',
      agente: null
    });
    assert.deepEqual(
      response.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
  } finally {
    await app.close();
  }
});

test('GET /atendimentos filtra por motivo', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?motivo=Car%C3%AAncia',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().itens.map((item: { id: string }) => item.id),
      ['a4']
    );
  } finally {
    await app.close();
  }
});

test('GET /atendimentos filtra por id da conversa', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?conversa=conv-a1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
  } finally {
    await app.close();
  }
});

test('nota da IA malformada não substitui a listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=nao-e-nota',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const repetida = await app.inject({
      method: 'GET',
      url: '/atendimentos?notaIa=7.5&notaIa=8.5',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = response.json().itens.map((item: { id: string }) => item.id);
    assert.ok(ids.includes('a1'));
    assert.ok(ids.includes('a2'));
    assert.equal(repetida.statusCode, 200);
    assert.ok(repetida.json().itens.map((item: { id: string }) => item.id).includes('a1'));
  } finally {
    await app.close();
  }
});

test('GET /atendimentos filtra por status da curadoria', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const feitas = await app.inject({
      method: 'GET',
      url: '/atendimentos?statusCuradoria=feita',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const pendentes = await app.inject({
      method: 'GET',
      url: '/atendimentos?statusCuradoria=pendente&conversa=conv-a1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(feitas.statusCode, 200);
    assert.deepEqual(
      feitas.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
    assert.equal(pendentes.statusCode, 200);
    assert.deepEqual(
      pendentes.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
  } finally {
    await app.close();
  }
});

test('GET /atendimentos filtra por Critérios e curador', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const naoAtendidos = await app.inject({
      method: 'GET',
      url: '/atendimentos?criteriosNaoAtendidos=Informa%C3%A7%C3%A3o%20de%20Protocolo',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const atendidos = await app.inject({
      method: 'GET',
      url: '/atendimentos?criteriosAtendidos=Sauda%C3%A7%C3%A3o&conversa=conv-a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const curador = await app.inject({
      method: 'GET',
      url: '/atendimentos?curador=perfil-carla',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(naoAtendidos.statusCode, 200);
    assert.deepEqual(
      naoAtendidos.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
    assert.equal(atendidos.statusCode, 200);
    assert.deepEqual(
      atendidos.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
    assert.equal(curador.statusCode, 200);
    assert.deepEqual(
      curador.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
  } finally {
    await app.close();
  }
});

test('mês civil corrente em America/Sao_Paulo vai do dia 1 ao último dia', () => {
  assert.deepEqual(periodoMesCivil(new Date('2026-09-14T15:00:00-03:00')), {
    inicio: '2026-09-01',
    fim: '2026-09-30'
  });
});

test('sem período submetido a listagem observa o mês civil corrente', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = response.json().itens.map((item: { id: string }) => item.id);
    assert.ok(ids.includes('a1'));
    assert.equal(ids.includes('a-fora'), false);
  } finally {
    await app.close();
  }
});

test('período submetido substitui o mês civil na listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?inicio=2020-01-01&fim=2020-01-31',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = response.json().itens.map((item: { id: string }) => item.id);
    assert.deepEqual(ids, ['a-fora']);
  } finally {
    await app.close();
  }
});

test('listagem pagina de 50 em 50', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const primeira = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const pagina1 = primeira.json();

    assert.equal(primeira.statusCode, 200);
    assert.equal(pagina1.tamanho, 50);
    assert.equal(pagina1.pagina, 1);
    assert.equal(pagina1.itens.length, 50);
    assert.ok(pagina1.total > 50);

    const segunda = await app.inject({
      method: 'GET',
      url: '/atendimentos?pagina=2',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const pagina2 = segunda.json();

    assert.equal(segunda.statusCode, 200);
    assert.equal(pagina2.pagina, 2);
    assert.equal(pagina2.itens.length, pagina1.total - 50);
    assert.equal(
      new Set([...pagina1.itens, ...pagina2.itens].map((item: { id: string }) => item.id)).size,
      pagina1.total
    );
  } finally {
    await app.close();
  }
});

test('período malformado não substitui o mês civil', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?inicio=2020-01-01&fim=nao-e-data',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const ids = response.json().itens.map((item: { id: string }) => item.id);
    assert.ok(ids.includes('a1'));
    assert.equal(ids.includes('a-fora'), false);
  } finally {
    await app.close();
  }
});

test('página além do total fica na última página', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?pagina=99',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.pagina, Math.ceil(body.total / body.tamanho));
    assert.ok(body.itens.length > 0);
  } finally {
    await app.close();
  }
});

test('GET /atendimentos sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/atendimentos' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Custo é visível só para Admin e Gestão', () => {
  assert.equal(custoVisivelPara('Curador'), false);
  assert.equal(custoVisivelPara('Admin'), true);
  assert.equal(custoVisivelPara('Gestão'), true);
});

test('Download de Áudio é visível só para Admin e Gestão', () => {
  assert.equal(downloadVisivelPara('Curador'), false);
  assert.equal(downloadVisivelPara('Admin'), true);
  assert.equal(downloadVisivelPara('Gestão'), true);
});

test('Gestão recebe Custo na listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const itens = response.json().itens as Array<{ custo?: string }>;
    assert.ok(itens.length > 0);
    assert.ok(itens.every((item) => typeof item.custo === 'string'));
  } finally {
    await app.close();
  }
});

test('Curador não recebe Custo na listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const itens = response.json().itens as Array<{ custo?: string }>;
    assert.ok(itens.length > 0);
    for (const item of itens) {
      assert.equal('custo' in item, false);
    }
  } finally {
    await app.close();
  }
});

test('GET /atendimentos/:id carrega o Atendimento certo', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const a1 = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const a2 = await app.inject({
      method: 'GET',
      url: '/atendimentos/a2',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(a1.statusCode, 200);
    assert.equal(a1.json().id, 'a1');
    assert.equal(a1.json().administradora, 'Affix');
    assert.equal(a1.json().agente, 'Clara Affix 0800');
    assert.equal(a1.json().motivo, 'Rede credenciada');
    assert.equal(a2.statusCode, 200);
    assert.equal(a2.json().id, 'a2');
    assert.equal(a2.json().agente, 'Clara Alter');
  } finally {
    await app.close();
  }
});

test('Gestão recebe Custo e Download no detalhe', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const body = response.json() as {
      custo?: string;
      downloadDeAudio?: string;
    };

    assert.equal(response.statusCode, 200);
    assert.equal(typeof body.custo, 'string');
    assert.equal(typeof body.downloadDeAudio, 'string');
  } finally {
    await app.close();
  }
});

test('Curador não recebe Custo nem Download no detalhe', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const body = response.json() as Record<string, unknown>;

    assert.equal(response.statusCode, 200);
    assert.equal('custo' in body, false);
    assert.equal('downloadDeAudio' in body, false);
  } finally {
    await app.close();
  }
});

test('detalhe sem conferência omite a Avaliação do Curador', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const semConferencia = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const comConferencia = await app.inject({
      method: 'GET',
      url: '/atendimentos/a2',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(semConferencia.statusCode, 200);
    assert.equal('avaliacaoDoCurador' in semConferencia.json(), false);
    assert.equal(comConferencia.statusCode, 200);
    assert.equal(typeof comConferencia.json().avaliacaoDoCurador, 'object');
  } finally {
    await app.close();
  }
});

test('GET /atendimentos/:id sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/atendimentos/a1' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('GET /atendimentos/:id desconhecido responde 404', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos/nao-existe',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('caminho de mídia do detalhe só aceita path relativo do HQ', () => {
  assert.equal(caminhoDeMidiaPermitido('/media/a1.wav'), true);
  assert.equal(caminhoDeMidiaPermitido('javascript:alert(1)'), false);
  assert.equal(caminhoDeMidiaPermitido('https://evil.example/a.wav'), false);
  assert.equal(caminhoDeMidiaPermitido('//cdn.example/a.wav'), false);
});
