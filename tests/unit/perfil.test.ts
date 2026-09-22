import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import {
  areasDaCasca,
  destinoDaNavegacao,
  destinoInicial,
  tituloDaPagina
} from '../../packages/contracts/src/casca.js';
import {
  loginResponseSchema,
  perfilSchema
} from '../../packages/contracts/src/perfil.js';
import { perfilDaAutorizacao } from '../../apps/api/src/modules/perfil/sessoes.js';

process.env.NODE_ENV = 'test';

test('Gestão entra na primeira área Dashboard', () => {
  assert.equal(destinoInicial('Gestão'), '/dashboard');
});

test('Curador entra na primeira área Atendimentos', () => {
  assert.equal(destinoInicial('Curador'), '/atendimentos');
});

test('Admin entra na primeira área Dashboard', () => {
  assert.equal(destinoInicial('Admin'), '/dashboard');
});

test('sessão inválida vai a /login', () => {
  assert.equal(
    destinoDaNavegacao({ perfil: null, pathname: '/dashboard' }),
    '/login'
  );
});

test('health permanece público sem Perfil', () => {
  assert.equal(
    destinoDaNavegacao({ perfil: null, pathname: '/health' }),
    '/health'
  );
});

test('/ autenticado abre a primeira área do papel', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Gestão' },
      pathname: '/'
    }),
    '/dashboard'
  );
});

test('deep link de Atendimento não é reescrito para a primeira área', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Gestão' },
      pathname: '/atendimentos/a1'
    }),
    '/atendimentos/a1'
  );
});

test('login com Perfil válido abre a primeira área', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Curador' },
      pathname: '/login'
    }),
    '/atendimentos'
  );
});

test('sessão de outro processo não autentica', () => {
  assert.equal(perfilDaAutorizacao('Bearer sessao-de-outro-processo'), undefined);
});

test('GET /perfil sem sessão responde 401', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/perfil' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('login recusado não fica em cache', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'errada' }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('Gestão autentica e recebe Perfil cujo destino inicial é Dashboard', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });

    assert.equal(response.statusCode, 200);
    const body = loginResponseSchema.parse(response.json());
    assert.equal(body.perfil.nome, 'Ana Souza');
    assert.equal(body.perfil.email, 'ana.souza@crion');
    assert.equal(body.perfil.papel, 'Gestão');
    assert.equal(destinoInicial(body.perfil.papel), '/dashboard');
    assert.ok(body.sessao.length > 0);
  } finally {
    await app.close();
  }
});

test('sessão válida devolve o Perfil autenticado', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const { perfil, sessao } = loginResponseSchema.parse(login.json());

    const response = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(perfilSchema.parse(response.json()), perfil);
  } finally {
    await app.close();
  }
});

test('Curador autentica e o destino inicial é Atendimentos', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });

    assert.equal(response.statusCode, 200);
    const body = loginResponseSchema.parse(response.json());
    assert.equal(body.perfil.nome, 'Carla Mendes');
    assert.equal(body.perfil.papel, 'Curador');
    assert.equal(destinoInicial(body.perfil.papel), '/atendimentos');
  } finally {
    await app.close();
  }
});

test('Admin autentica e o destino inicial é Dashboard', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'bruno.alves@crion', senha: 'crion-hq' }
    });

    assert.equal(response.statusCode, 200);
    const body = loginResponseSchema.parse(response.json());
    assert.equal(body.perfil.nome, 'Bruno Alves');
    assert.equal(body.perfil.papel, 'Admin');
    assert.equal(destinoInicial(body.perfil.papel), '/dashboard');
  } finally {
    await app.close();
  }
});

test('encerrar sessão invalida o Perfil', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const { sessao } = loginResponseSchema.parse(login.json());

    const sair = await app.inject({
      method: 'POST',
      url: '/sair',
      headers: {
        authorization: `Bearer ${sessao}`,
        'content-type': 'application/json'
      },
      payload: {}
    });
    assert.equal(sair.statusCode, 204);

    const perfil = await app.inject({
      method: 'GET',
      url: '/perfil',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(perfil.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('casca da Gestão usa rótulo curto Ao vivo e h1 de domínio', () => {
  const aoVivo = areasDaCasca('Gestão').find((area) => area.rota === '/monitoramento');
  assert.equal(aoVivo?.rotulo, 'Ao vivo');
  assert.equal(aoVivo?.titulo, 'Monitoramento ao Vivo');
});

test('casca libera as áreas do papel com rótulos curtos', () => {
  assert.deepEqual(
    areasDaCasca('Gestão').map((area) => area.rotulo),
    [
      'Dashboard',
      'Atendimentos',
      'Ao vivo',
      'Fila de curadoria',
      'Curadorias realizadas',
      'Régua'
    ]
  );
  assert.deepEqual(
    areasDaCasca('Curador').map((area) => area.rotulo),
    [
      'Atendimentos',
      'Ao vivo',
      'Fila de curadoria',
      'Minhas curadorias',
      'Régua'
    ]
  );
  assert.deepEqual(
    areasDaCasca('Admin').map((area) => area.rotulo),
    [
      'Dashboard',
      'Atendimentos',
      'Ao vivo',
      'Fila de curadoria',
      'Curadorias realizadas',
      'Manutenção',
      'Usuários',
      'IA Avaliadora',
      'Régua'
    ]
  );
});

test('h1 do deep link usa o termo Atendimento', () => {
  assert.equal(tituloDaPagina('/atendimentos/a1', 'Gestão'), 'Atendimento');
});

test('papel não permanece em área que a casca não libera', () => {
  assert.equal(
    destinoDaNavegacao({
      perfil: { papel: 'Curador' },
      pathname: '/dashboard'
    }),
    '/atendimentos'
  );
});
