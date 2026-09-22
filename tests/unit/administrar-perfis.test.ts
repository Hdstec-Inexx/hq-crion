import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import {
  destinoDaNavegacao,
  destinoInicial,
  tituloDaPagina
} from '../../packages/contracts/src/casca.js';
import {
  listaDePerfisSchema,
  loginResponseSchema,
  papelSchema,
  motivoUltimoAdmin,
  perfilComIdSchema
} from '../../packages/contracts/src/perfil.js';

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

test('Curador autenticado recebe negação ao listar Perfis', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Gestão autenticada recebe negação ao listar Perfis', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Admin lista Perfis sem Administradora, só com os três papéis', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    const corpo = response.json();
    assert.equal('administradora' in corpo, false);
    const { perfis } = listaDePerfisSchema.parse(corpo);
    assert.equal(
      perfis.every((perfil) => !('administradora' in perfil)),
      true
    );
    assert.deepEqual(
      [...new Set(perfis.map((perfil) => perfil.papel))].sort(),
      ['Admin', 'Curador', 'Gestão']
    );
    assert.equal(
      perfis.some(
        (perfil) =>
          perfil.nome === 'Bruno Alves' &&
          perfil.email === 'bruno.alves@crion' &&
          perfil.papel === 'Admin'
      ),
      true
    );
  } finally {
    await app.close();
  }
});

test('GET /perfis sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/perfis'
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Gestão autenticada recebe negação ao criar Perfil', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Diego Lima',
        email: 'diego.lima@crion',
        papel: 'Curador'
      }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Curador autenticado recebe negação ao criar Perfil', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Elisa Nunes',
        email: 'elisa.nunes@crion',
        papel: 'Gestão'
      }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Admin cria Perfil com identidade e um dos três papéis, sem Administradora', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Diego Lima',
        email: 'diego.lima@crion',
        papel: 'Curador',
        administradora: 'Affix'
      }
    });

    assert.equal(response.statusCode, 201);
    const criado = perfilComIdSchema.parse(response.json());
    assert.equal(criado.nome, 'Diego Lima');
    assert.equal(criado.email, 'diego.lima@crion');
    assert.equal(criado.papel, 'Curador');
    assert.equal(criado.ativo, true);
    assert.equal('administradora' in response.json(), false);
    assert.equal(criado.id.length > 0, true);
    papelSchema.parse(criado.papel);

    const listagem = await app.inject({
      method: 'GET',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const { perfis } = listaDePerfisSchema.parse(listagem.json());
    assert.equal(
      perfis.some(
        (perfil) =>
          perfil.id === criado.id &&
          perfil.email === 'diego.lima@crion' &&
          perfil.papel === 'Curador'
      ),
      true
    );
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil com papel fora dos três', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Fora',
        email: 'fora@crion',
        papel: 'Cliente'
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('Curador autenticado recebe negação ao alterar Perfil', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-ana',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Ana Souza',
        email: 'ana.souza@crion',
        papel: 'Admin'
      }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('mudança de papel pelo Admin vale na revalidação da sessão', async () => {
  const { app, sessao: sessaoAdmin } = await sessaoDe('bruno.alves@crion');

  try {
    const criado = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        nome: 'Helena Dias',
        email: 'helena.dias@crion',
        papel: 'Curador'
      }
    });
    const perfil = perfilComIdSchema.parse(criado.json());

    const loginCuradora = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'helena.dias@crion', senha: 'crion-hq' }
    });
    const { sessao: sessaoCuradora, perfil: perfilNaSessao } =
      loginResponseSchema.parse(loginCuradora.json());
    assert.equal(perfilNaSessao.papel, 'Curador');

    const alteracao = await app.inject({
      method: 'PUT',
      url: `/perfis/${perfil.id}`,
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        nome: 'Helena Dias Costa',
        email: 'helena.dias@crion',
        papel: 'Gestão'
      }
    });

    assert.equal(alteracao.statusCode, 200);
    const atualizado = perfilComIdSchema.parse(alteracao.json());
    assert.equal(atualizado.papel, 'Gestão');
    assert.equal(atualizado.nome, 'Helena Dias Costa');
    assert.equal('administradora' in alteracao.json(), false);

    const revalidacao = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessaoCuradora}` }
    });
    assert.equal(revalidacao.statusCode, 200);
    assert.equal(revalidacao.json().papel, 'Gestão');
    assert.equal(revalidacao.json().nome, 'Helena Dias Costa');
    assert.equal(destinoInicial(revalidacao.json().papel), '/dashboard');

    const listagemComoGestao = await app.inject({
      method: 'GET',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessaoCuradora}` }
    });
    assert.equal(listagemComoGestao.statusCode, 403);
    assert.equal(
      destinoDaNavegacao({
        perfil: { papel: revalidacao.json().papel },
        pathname: '/usuarios'
      }),
      '/dashboard'
    );
  } finally {
    await app.close();
  }
});

test('Gestão autenticada recebe negação ao alterar Perfil', async () => {
  const { app, sessao } = await sessaoDe('ana.souza@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-carla',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Carla Mendes',
        email: 'carla.mendes@crion',
        papel: 'Admin'
      }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('preflight de PUT /perfis/:id autoriza Authorization', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/perfis/perfil-ana',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization,content-type'
      }
    });

    assert.equal(response.statusCode, 204);
    const metodos = String(
      response.headers['access-control-allow-methods']
    ).toUpperCase();
    assert.match(metodos, /PUT/);
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil com e-mail já usado', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Outra Ana',
        email: 'ana.souza@crion',
        papel: 'Curador'
      }
    });

    assert.equal(response.statusCode, 409);
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil com e-mail já usado em outra capitalização', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Outra Ana',
        email: 'Ana.Souza@crion',
        papel: 'Curador'
      }
    });

    assert.equal(response.statusCode, 409);
  } finally {
    await app.close();
  }
});

test('login encontra o Perfil mesmo com e-mail em outra capitalização', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'Bruno.Alves@crion', senha: 'crion-hq' }
    });

    assert.equal(response.statusCode, 200);
    const body = loginResponseSchema.parse(response.json());
    assert.equal(body.perfil.email, 'bruno.alves@crion');
    assert.equal(body.perfil.papel, 'Admin');
  } finally {
    await app.close();
  }
});

test('só Admin acede a Usuários na casca; o h1 usa Perfis', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Curador' },
      pathname: '/usuarios'
    }),
    '/atendimentos'
  );
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Gestão' },
      pathname: '/usuarios'
    }),
    '/dashboard'
  );
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Admin' },
      pathname: '/usuarios'
    }),
    '/usuarios'
  );
  assert.equal(tituloDaPagina('/usuarios', 'Admin'), 'Perfis');
});

test('Admin desativa Perfil: a sessão cai e o login passa a falhar até reativar', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const loginCarla = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });
    const { sessao: sessaoCarla } = loginResponseSchema.parse(loginCarla.json());

    const desativar = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-carla/ativo',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { ativo: false }
    });

    assert.equal(desativar.statusCode, 200);
    assert.equal(desativar.headers['cache-control'], 'no-store');
    assert.equal(perfilComIdSchema.parse(desativar.json()).ativo, false);

    const sessaoAntiga = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessaoCarla}` }
    });
    assert.equal(sessaoAntiga.statusCode, 401);

    const loginDeNovo = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });
    assert.equal(loginDeNovo.statusCode, 401);

    const reativar = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-carla/ativo',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { ativo: true }
    });
    assert.equal(reativar.statusCode, 200);
    assert.equal(perfilComIdSchema.parse(reativar.json()).ativo, true);

    const loginDepois = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });
    assert.equal(loginDepois.statusCode, 200);
  } finally {
    await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-carla/ativo',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { ativo: true }
    });
    await app.close();
  }
});

test('o último Admin ativo não se desativa nem troca de papel', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const desativar = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-bruno/ativo',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { ativo: false }
    });
    assert.equal(desativar.statusCode, 409);
    assert.equal(desativar.json().motivo, motivoUltimoAdmin);

    const troca = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-bruno',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Bruno Alves',
        email: 'bruno.alves@crion',
        papel: 'Curador'
      }
    });
    assert.equal(troca.statusCode, 409);
    assert.equal(troca.json().motivo, motivoUltimoAdmin);

    const aindaAdmin = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(aindaAdmin.statusCode, 200);
    assert.equal(aindaAdmin.json().papel, 'Admin');
  } finally {
    await app.close();
  }
});

test('Curador não desativa Perfil', async () => {
  const { app, sessao } = await sessaoDe('carla.mendes@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-ana/ativo',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { ativo: false }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});
