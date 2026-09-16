import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import {
  areasDaCasca,
  destinoDaNavegacao,
  tituloDaPagina
} from '../../packages/contracts/src/casca.js';
import { configuracaoDaIaAvaliadoraSchema } from '../../packages/contracts/src/ia-avaliadora.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';

process.env.NODE_ENV = 'test';

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

test('só o Admin vê IA Avaliadora na casca; o h1 usa o termo de domínio', () => {
  assert.equal(
    areasDaCasca('Admin').some((area) => area.rota === '/ia-avaliadora'),
    true
  );
  assert.equal(
    areasDaCasca('Gestão').some((area) => area.rota === '/ia-avaliadora'),
    false
  );
  assert.equal(
    areasDaCasca('Curador').some((area) => area.rota === '/ia-avaliadora'),
    false
  );
  assert.equal(tituloDaPagina('/ia-avaliadora', 'Admin'), 'IA Avaliadora');
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Gestão' },
      pathname: '/ia-avaliadora'
    }),
    '/dashboard'
  );
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Curador' },
      pathname: '/ia-avaliadora'
    }),
    '/atendimentos'
  );
});

test('contrato da IA Avaliadora rejeita temperatura fora de 0 a 2', () => {
  assert.throws(() =>
    configuracaoDaIaAvaliadoraSchema.parse({
      prompt: 'Avalie o Atendimento.',
      modelo: 'gpt-4o',
      temperatura: 3
    })
  );
});

test('GET /ia-avaliadora sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora'
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Gestão autenticada recebe negação ao ler a IA Avaliadora', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Curador autenticado recebe negação ao ler a IA Avaliadora', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Admin lê a configuração única: prompt, modelo e temperatura, sem Administradora', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    const corpo = response.json();
    assert.equal('administradora' in corpo, false);
    assert.equal('agente' in corpo, false);
    const config = configuracaoDaIaAvaliadoraSchema.parse(corpo);
    assert.equal(
      config.prompt,
      'Avalie o Atendimento pela Régua de Avaliação única das Claras.'
    );
    assert.equal(config.modelo, 'gpt-4o');
    assert.equal(config.temperatura, 0);
  } finally {
    await app.close();
  }
});

test('Gestão autenticada recebe negação ao gravar a IA Avaliadora', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        prompt: 'Não grave isto.',
        modelo: 'gpt-4o-mini',
        temperatura: 0.2
      }
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Curador autenticado recebe negação ao gravar a IA Avaliadora', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        prompt: 'Não grave isto.',
        modelo: 'gpt-4o-mini',
        temperatura: 0.2
      }
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Admin grava a configuração única e a leitura seguinte devolve o mesmo recurso', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');
  const atualizada = {
    prompt: 'Pontue o Atendimento só com a Régua única.',
    modelo: 'gpt-4o-mini',
    temperatura: 0.3
  };
  let original:
    | {
        prompt: string;
        modelo: string;
        temperatura: number;
      }
    | undefined;

  try {
    const leitura = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    original = configuracaoDaIaAvaliadoraSchema.parse(leitura.json());

    const gravacao = await app.inject({
      method: 'PUT',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` },
      payload: atualizada
    });

    assert.equal(gravacao.statusCode, 200);
    assert.equal(gravacao.headers['cache-control'], 'no-store');
    assert.deepEqual(
      configuracaoDaIaAvaliadoraSchema.parse(gravacao.json()),
      atualizada
    );

    const depois = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(depois.statusCode, 200);
    assert.deepEqual(
      configuracaoDaIaAvaliadoraSchema.parse(depois.json()),
      atualizada
    );
  } finally {
    if (original) {
      await app.inject({
        method: 'PUT',
        url: '/ia-avaliadora',
        headers: { authorization: `Bearer ${sessao}` },
        payload: original
      });
    }
    await app.close();
  }
});

test('PUT inválido não altera a configuração única', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const leitura = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const original = configuracaoDaIaAvaliadoraSchema.parse(leitura.json());

    const recusa = await app.inject({
      method: 'PUT',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        prompt: '',
        modelo: 'gpt-4o',
        temperatura: 0,
        administradora: 'Affix'
      }
    });

    assert.equal(recusa.statusCode, 400);

    const depois = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.deepEqual(
      configuracaoDaIaAvaliadoraSchema.parse(depois.json()),
      original
    );
  } finally {
    await app.close();
  }
});

test('Recorte na query não cria uma segunda IA Avaliadora', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const consolidada = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const recortada = await app.inject({
      method: 'GET',
      url: '/ia-avaliadora?administradora=Affix&agente=Clara-Affix',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(consolidada.statusCode, 200);
    assert.equal(recortada.statusCode, 200);
    assert.deepEqual(consolidada.json(), recortada.json());
  } finally {
    await app.close();
  }
});

test('preflight de PUT /ia-avaliadora autoriza Authorization e Cache-Control', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/ia-avaliadora',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PUT',
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
