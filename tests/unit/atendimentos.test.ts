import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { custoVisivelPara } from '../../packages/contracts/src/atendimento.js';
import {
  lerRecorte,
  periodoMesCivil,
  queryDoRecorte
} from '../../packages/contracts/src/recorte.js';

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

test('GET /atendimentos filtra por nota', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?nota=6',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
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

test('GET /atendimentos filtra por curadoria feita', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/atendimentos?curadoria=true',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().itens.map((item: { id: string }) => item.id),
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
