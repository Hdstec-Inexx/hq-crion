import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { areasDaCasca } from '../../packages/contracts/src/casca.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { reguaDeAvaliacaoSchema } from '../../packages/contracts/src/regua.js';

process.env.NODE_ENV = 'test';

test('contrato da Régua rejeita Critérios cuja soma não é 10', () => {
  assert.throws(() =>
    reguaDeAvaliacaoSchema.parse({
      criterios: [{ nome: 'Saudação', valor: 1, critico: false }],
      limiarDeAprovacao: 7
    })
  );
});

test('Régua está na casca de Admin, Gestão e Curador, com o termo de domínio no título', () => {
  for (const papel of ['Admin', 'Gestão', 'Curador'] as const) {
    const area = areasDaCasca(papel).find((item) => item.rota === '/regua');
    assert.equal(area?.rotulo, 'Régua');
    assert.equal(area?.titulo, 'Régua de Avaliação');
  }
});

async function sessaoDe(email: string) {
  const app = await buildApp();
  const login = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email, senha: 'crion-hq' }
  });
  const { sessao } = loginResponseSchema.parse(login.json());
  return { app, sessao };
}

test('GET /regua sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/regua' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Gestão autenticada consulta a Régua única: critérios somam 10, com crítico e limiar de Aprovação', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/regua',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const corpo = response.json();
    assert.equal('administradora' in corpo, false);
    assert.equal('agente' in corpo, false);
    const regua = reguaDeAvaliacaoSchema.parse(corpo);
    assert.equal(
      regua.criterios.reduce((soma, criterio) => soma + criterio.valor, 0),
      10
    );
    assert.equal(regua.limiarDeAprovacao, 7);
    assert.equal(
      regua.criterios.find((criterio) => criterio.nome === 'Saudação')?.valor,
      1
    );
    const protocolo = regua.criterios.find(
      (criterio) => criterio.nome === 'Informação de Protocolo'
    );
    assert.equal(protocolo?.valor, 1);
    assert.equal(protocolo?.critico, true);
    assert.equal(typeof protocolo?.chave, 'string');
    assert.equal(protocolo && protocolo.chave.length > 0, true);
    assert.equal(protocolo?.admiteNaoSeAplica, false);
    const validacao = regua.criterios.find(
      (criterio) => criterio.nome === 'Validação de e-mail'
    );
    assert.equal(validacao?.admiteNaoSeAplica, true);
    assert.equal(
      regua.criterios.filter((criterio) => criterio.admiteNaoSeAplica).length,
      1
    );
    assert.equal(
      new Set(regua.criterios.map((criterio) => criterio.chave)).size,
      regua.criterios.length
    );
  } finally {
    await app.close();
  }
});

test('o contrato da Régua é o mesmo recurso para todos os papéis autenticados', async () => {
  const app = await buildApp();

  try {
    const corpos = [];

    for (const email of [
      'ana.souza@crion',
      'carla.mendes@crion',
      'bruno.alves@crion'
    ]) {
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email, senha: 'crion-hq' }
      });
      const { sessao } = loginResponseSchema.parse(login.json());
      const response = await app.inject({
        method: 'GET',
        url: '/regua',
        headers: { authorization: `Bearer ${sessao}` }
      });
      assert.equal(response.statusCode, 200);
      corpos.push(response.json());
    }

    assert.deepEqual(corpos[0], corpos[1]);
    assert.deepEqual(corpos[0], corpos[2]);
    reguaDeAvaliacaoSchema.parse(corpos[0]);
  } finally {
    await app.close();
  }
});

test('Recorte na query não muda a Régua única', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const consolidada = await app.inject({
      method: 'GET',
      url: '/regua',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const recortada = await app.inject({
      method: 'GET',
      url: '/regua?administradora=Affix&agente=Clara-Affix',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(consolidada.statusCode, 200);
    assert.equal(recortada.statusCode, 200);
    assert.deepEqual(consolidada.json(), recortada.json());
  } finally {
    await app.close();
  }
});

test('Régua única permanece só leitura', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const antes = await app.inject({
      method: 'GET',
      url: '/regua',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const edicao = await app.inject({
      method: 'PUT',
      url: '/regua',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        criterios: antes.json().criterios,
        limiarDeAprovacao: 8
      }
    });
    const depois = await app.inject({
      method: 'GET',
      url: '/regua',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(antes.statusCode, 200);
    assert.equal(edicao.statusCode, 404);
    assert.deepEqual(depois.json(), antes.json());
  } finally {
    await app.close();
  }
});

test('preflight de GET /regua autoriza Authorization e Cache-Control', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/regua',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,cache-control'
      }
    });

    assert.equal(response.statusCode, 204);
    const permitidos = String(
      response.headers['access-control-allow-headers']
    ).toLowerCase();
    assert.match(permitidos, /authorization/);
    assert.match(permitidos, /cache-control/);
  } finally {
    await app.close();
  }
});

