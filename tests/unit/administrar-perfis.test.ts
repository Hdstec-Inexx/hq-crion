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

async function sessaoDeNoApp(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const login = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email, senha: 'crion-hq' }
  });
  const { sessao } = loginResponseSchema.parse(login.json());
  return sessao;
}

async function sessaoDe(email: string) {
  const app = await buildApp();
  return { app, sessao: await sessaoDeNoApp(app, email) };
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
        senha: 'senha-inicial',
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
    assert.equal('senha' in response.json(), false);
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
        papel: 'Cliente',
        senha: 'senha-inicial'
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
        papel: 'Curador',
        senha: 'senha-inicial'
      }
    });
    const perfil = perfilComIdSchema.parse(criado.json());

    const loginCuradora = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'helena.dias@crion', senha: 'senha-inicial' }
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
        papel: 'Curador',
        senha: 'senha-inicial'
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
        papel: 'Curador',
        senha: 'senha-inicial'
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

test('Gestão e Curador recebem recusa ao redefinir senha', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const criado = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Igor Pires',
        email: 'igor.pires@crion',
        papel: 'Gestão',
        senha: 'senha-inicial'
      }
    });
    const perfil = perfilComIdSchema.parse(criado.json());
    const gestao = await sessaoDeNoApp(app, 'ana.souza@crion');
    const curador = await sessaoDeNoApp(app, 'carla.mendes@crion');

    const recusaGestao = await app.inject({
      method: 'PUT',
      url: `/perfis/${perfil.id}/senha`,
      headers: { authorization: `Bearer ${gestao}` },
      payload: { senha: 'senha-nova' }
    });
    const recusaCurador = await app.inject({
      method: 'PUT',
      url: `/perfis/${perfil.id}/senha`,
      headers: { authorization: `Bearer ${curador}` },
      payload: { senha: 'senha-nova' }
    });

    assert.equal(recusaGestao.statusCode, 403);
    assert.equal(recusaCurador.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('Admin não redefine senha longa demais', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-carla/senha',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { senha: 'a'.repeat(200) }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('Admin redefine senha: sessões antigas morrem e a senha nova abre sessão nova', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const criado = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Julia Castro',
        email: 'julia.castro@crion',
        papel: 'Curador',
        senha: 'senha-inicial'
      }
    });
    const perfil = perfilComIdSchema.parse(criado.json());
    const loginAntigo = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'julia.castro@crion', senha: 'senha-inicial' }
    });
    const { sessao: sessaoAntiga } = loginResponseSchema.parse(loginAntigo.json());

    const redefinir = await app.inject({
      method: 'PUT',
      url: `/perfis/${perfil.id}/senha`,
      headers: { authorization: `Bearer ${sessao}` },
      payload: { senha: 'senha-nova' }
    });

    assert.equal(redefinir.statusCode, 204);
    assert.equal(redefinir.headers['cache-control'], 'no-store');

    const sessaoMorta = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessaoAntiga}` }
    });
    assert.equal(sessaoMorta.statusCode, 401);

    const senhaAntiga = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'julia.castro@crion', senha: 'senha-inicial' }
    });
    assert.equal(senhaAntiga.statusCode, 401);

    const senhaNova = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'julia.castro@crion', senha: 'senha-nova' }
    });
    assert.equal(senhaNova.statusCode, 200);
    const { sessao: sessaoNova } = loginResponseSchema.parse(senhaNova.json());
    const perfilNovo = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessaoNova}` }
    });
    assert.equal(perfilNovo.statusCode, 200);
    assert.equal(perfilNovo.json().email, 'julia.castro@crion');
  } finally {
    await app.close();
  }
});

test('o último Admin ativo continua protegido depois de redefinir senha', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const redefinir = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-bruno/senha',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { senha: 'admin-nova' }
    });
    assert.equal(redefinir.statusCode, 204);

    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'bruno.alves@crion', senha: 'admin-nova' }
    });
    const { sessao: sessaoNova } = loginResponseSchema.parse(login.json());

    const desativar = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-bruno/ativo',
      headers: { authorization: `Bearer ${sessaoNova}` },
      payload: { ativo: false }
    });
    assert.equal(desativar.statusCode, 409);
    assert.equal(desativar.json().motivo, motivoUltimoAdmin);

    await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-bruno/senha',
      headers: { authorization: `Bearer ${sessaoNova}` },
      payload: { senha: 'crion-hq' }
    });
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil sem Senha inicial', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Sem Senha',
        email: 'sem.senha@crion',
        papel: 'Curador'
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil com Senha inicial menor que 8 caracteres', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Senha Curta',
        email: 'senha.curta@crion',
        papel: 'Gestão',
        senha: 'curta'
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('Admin não cria Perfil com Senha inicial maior que 128 caracteres', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Senha Longa',
        email: 'senha.longa.inicial@crion',
        papel: 'Gestão',
        senha: 'a'.repeat(129)
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('Perfil novo autentica com a Senha inicial e a resposta não devolve a Senha', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Lia Prado',
        email: 'lia.prado@crion',
        papel: 'Curador',
        senha: 'senha-inicial'
      }
    });

    assert.equal(response.statusCode, 201);
    const criado = perfilComIdSchema.parse(response.json());
    assert.equal('senha' in response.json(), false);
    assert.equal(criado.email, 'lia.prado@crion');

    const senhaFixa = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'lia.prado@crion', senha: 'crion-hq' }
    });
    assert.equal(senhaFixa.statusCode, 401);

    const senhaInicial = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'lia.prado@crion', senha: 'senha-inicial' }
    });
    assert.equal(senhaInicial.statusCode, 200);
    assert.equal(loginResponseSchema.parse(senhaInicial.json()).perfil.papel, 'Curador');
  } finally {
    await app.close();
  }
});

test('criar outro Perfil não troca a Senha dos Perfis que já existem', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Otto Reis',
        email: 'otto.reis@crion',
        papel: 'Gestão',
        senha: 'senha-do-otto'
      }
    });
    assert.equal(response.statusCode, 201);

    for (const email of ['ana.souza@crion', 'carla.mendes@crion', 'bruno.alves@crion']) {
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email, senha: 'crion-hq' }
      });
      assert.equal(login.statusCode, 200, email);
    }
  } finally {
    await app.close();
  }
});

test('editar nome, e-mail e papel não pede Senha e mantém a Senha inicial', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const criado = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Nina Costa',
        email: 'nina.costa@crion',
        papel: 'Curador',
        senha: 'senha-da-nina'
      }
    });
    const perfil = perfilComIdSchema.parse(criado.json());

    const edicao = await app.inject({
      method: 'PUT',
      url: `/perfis/${perfil.id}`,
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        nome: 'Nina Costa Lima',
        email: 'nina.lima@crion',
        papel: 'Gestão'
      }
    });

    assert.equal(edicao.statusCode, 200);
    const atualizado = perfilComIdSchema.parse(edicao.json());
    assert.equal(atualizado.nome, 'Nina Costa Lima');
    assert.equal(atualizado.email, 'nina.lima@crion');
    assert.equal(atualizado.papel, 'Gestão');
    assert.equal('senha' in edicao.json(), false);

    const senhaAntiga = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nina.lima@crion', senha: 'senha-da-nina' }
    });
    assert.equal(senhaAntiga.statusCode, 200);
    assert.equal(loginResponseSchema.parse(senhaAntiga.json()).perfil.papel, 'Gestão');
  } finally {
    await app.close();
  }
});

test('Admin não redefine senha com menos de 8 caracteres', async () => {
  const { app, sessao } = await sessaoDe('bruno.alves@crion');

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/perfis/perfil-ana/senha',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { senha: 'curta' }
    });

    assert.equal(response.statusCode, 400);

    const senhaAtual = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    assert.equal(senhaAtual.statusCode, 200);
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
