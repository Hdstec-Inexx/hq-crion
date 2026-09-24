import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { destinoDaLista } from '../../packages/contracts/src/recorte.js';
import { areasDaCasca } from '../../packages/contracts/src/casca.js';
import { reguaUnica } from '../../apps/api/src/modules/regua/regua-unica.js';

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

function checklistDaConferencia() {
  return reguaUnica.criterios.map((criterio) => ({
    nome: criterio.nome,
    estado: criterio.nome === 'Validação de e-mail' ? 'Não se aplica' : 'Atendido',
    pontos: criterio.valor,
    critico: criterio.critico
  }));
}

test('voltar à Fila de Curadoria preserva Recorte na URL', () => {
  assert.equal(
    destinoDaLista(
      { administradora: 'Affix', agente: 'affix-0800' },
      '/fila-de-curadoria'
    ),
    '/fila-de-curadoria?administradora=Affix&agente=affix-0800'
  );
});

test('casca do Curador tem Minhas Curadorias e a da Gestão tem Curadorias Realizadas', () => {
  assert.ok(
    areasDaCasca('Curador').some((area) => area.rota === '/minhas-curadorias')
  );
  assert.equal(
    areasDaCasca('Curador').some((area) => area.rota === '/curadorias-realizadas'),
    false
  );
  assert.ok(
    areasDaCasca('Gestão').some((area) => area.rota === '/curadorias-realizadas')
  );
  assert.ok(
    areasDaCasca('Admin').some((area) => area.rota === '/curadorias-realizadas')
  );
});

test('GET /fila-de-curadoria puxa só concluídos avaliados pela IA, do mais antigo', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      recorte: { administradora: null; agente: null };
      itens: Array<{ id: string; status: string; curadoria: boolean }>;
    };
    assert.deepEqual(body.recorte, { administradora: null, agente: null });
    const ids = body.itens.map((item) => item.id);

    assert.ok(ids.includes('a1'));
    assert.ok(ids.includes('a3'));
    assert.equal(ids.includes('a2'), false);
    assert.equal(ids.includes('a4'), false);
    assert.equal(ids.includes('a-fora'), false);
    assert.ok(body.itens.every((item) => item.status === 'Concluído'));
    assert.ok(body.itens.every((item) => item.curadoria === false));
    assert.ok(ids.indexOf('a1') < ids.indexOf('a3'));
    assert.ok(ids.indexOf('extra-1') < ids.indexOf('a1'));
  } finally {
    await app.close();
  }
});

test('GET /fila-de-curadoria recorta pela Administradora e Agente da URL', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?administradora=Affix&agente=affix-0800',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(body.recorte, {
      administradora: 'Affix',
      agente: 'affix-0800'
    });
    assert.deepEqual(
      body.itens.map((item: { id: string }) => item.id),
      ['a1']
    );
  } finally {
    await app.close();
  }
});

test('GET /fila-de-curadoria filtra por conversa, motivo e nota da IA', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const conversa = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?conversa=conv-a1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const motivo = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?motivo=N%C3%A3o%20informado',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const notaIa = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?notaIa=8.5',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const zero = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?notaIa=0',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const semParam = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const foraDoDegrau = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?notaIa=7.3',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const malformada = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?notaIa=nao-e-nota',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(conversa.statusCode, 200);
    assert.deepEqual(
      conversa.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
    assert.equal(motivo.statusCode, 200);
    assert.deepEqual(
      motivo.json().itens.map((item: { id: string }) => item.id),
      ['a3']
    );
    assert.equal(notaIa.statusCode, 200);
    assert.deepEqual(
      notaIa.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
    assert.equal(zero.statusCode, 200);
    assert.deepEqual(
      zero.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
    assert.equal(foraDoDegrau.statusCode, 200);
    assert.deepEqual(
      foraDoDegrau.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
    assert.equal(malformada.statusCode, 200);
    assert.deepEqual(
      malformada.json().itens.map((item: { id: string }) => item.id),
      semParam.json().itens.map((item: { id: string }) => item.id)
    );
  } finally {
    await app.close();
  }
});

test('GET /fila-de-curadoria ignora indicador do pulso', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const fila = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?indicador=pioresAtendimentos',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(fila.statusCode, 200);
    const ids = fila.json().itens.map((item: { id: string }) => item.id);
    assert.ok(ids.includes('a1'));
    assert.ok(ids.includes('a3'));
    assert.ok(ids.length > 5);
    assert.ok(ids.indexOf('extra-1') < ids.indexOf('a1'));
  } finally {
    await app.close();
  }
});

test('GET /fila-de-curadoria ignora Critérios e curador da Listagem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const semExtras = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?administradora=Affix&agente=affix-0800',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const comExtras = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?administradora=Affix&agente=affix-0800&curador=perfil-bruno&criteriosNaoAtendidos=Saudação',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(semExtras.statusCode, 200);
    assert.equal(comExtras.statusCode, 200);
    assert.deepEqual(
      semExtras.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
    assert.deepEqual(
      comExtras.json().itens.map((item: { id: string }) => item.id),
      ['a1']
    );
  } finally {
    await app.close();
  }
});

test('GET /fila-de-curadoria rejeita Recorte inválido', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('conferência do Curador persiste snapshot e tira o Atendimento da fila', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const payload = {
      checklist: checklistDaConferencia(),
      notaDaRegua: 8.5,
      notaDaAvaliacaoDaIa: 8.5,
      comentario: 'Conferência alinhada com a Régua.'
    };

    const gravacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload
    });

    assert.equal(gravacao.statusCode, 200);
    const detalhe = gravacao.json();
    assert.equal(detalhe.id, 'a1');
    assert.equal(detalhe.avaliacaoDoCurador.nota, 8.5);
    assert.equal(detalhe.avaliacaoDoCurador.notaDaAvaliacaoDaIa, 8.5);
    assert.equal(
      detalhe.avaliacaoDoCurador.comentario,
      'Conferência alinhada com a Régua.'
    );
    assert.deepEqual(
      detalhe.avaliacaoDoCurador.criterios.map(
        (criterio: { nome: string; estado: string }) => [criterio.nome, criterio.estado]
      ),
      payload.checklist.map((criterio) => [criterio.nome, criterio.estado])
    );

    const fila = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const idsDaFila = fila.json().itens.map((item: { id: string }) => item.id);
    assert.equal(idsDaFila.includes('a1'), false);

    const minhas = await app.inject({
      method: 'GET',
      url: '/minhas-curadorias',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(minhas.statusCode, 200);
    assert.ok(
      minhas.json().itens.some((item: { id: string }) => item.id === 'a1')
    );

    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const realizadas = await app.inject({
      method: 'GET',
      url: '/curadorias-realizadas',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    assert.equal(realizadas.statusCode, 200);
    const idsRealizadas = realizadas
      .json()
      .itens.map((item: { id: string }) => item.id);
    assert.ok(idsRealizadas.includes('a1'));
    assert.ok(idsRealizadas.includes('a2'));
  } finally {
    await app.close();
  }
});

test('Gestão não grava conferência', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'ana.souza@crion');
    const response = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessao}` },
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 8,
        notaDaAvaliacaoDaIa: 8.5
      }
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('curador filtra Curadorias realizadas e não restringe Minhas Curadorias', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const minhas = await app.inject({
      method: 'GET',
      url: '/minhas-curadorias?curador=perfil-bruno',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const realizadas = await app.inject({
      method: 'GET',
      url: '/curadorias-realizadas?curador=perfil-carla',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    const realizadasOutro = await app.inject({
      method: 'GET',
      url: '/curadorias-realizadas?curador=perfil-bruno',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });

    assert.equal(minhas.statusCode, 200);
    assert.ok(minhas.json().itens.some((item: { id: string }) => item.id === 'a2'));
    const minhasComStatus = await app.inject({
      method: 'GET',
      url: '/minhas-curadorias?statusCuradoria=pendente',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(minhasComStatus.statusCode, 200);
    assert.ok(
      minhasComStatus.json().itens.some((item: { id: string }) => item.id === 'a2')
    );
    assert.equal(realizadas.statusCode, 200);
    assert.deepEqual(
      realizadas.json().itens.map((item: { id: string }) => item.id),
      ['a2']
    );
    assert.equal(realizadasOutro.statusCode, 200);
    assert.deepEqual(
      realizadasOutro.json().itens.map((item: { id: string }) => item.id),
      []
    );
  } finally {
    await app.close();
  }
});

test('Curador não lista Curadorias Realizadas; Gestão não lista Minhas Curadorias', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');

    const realizadasDoCurador = await app.inject({
      method: 'GET',
      url: '/curadorias-realizadas',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const minhasDaGestao = await app.inject({
      method: 'GET',
      url: '/minhas-curadorias',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });

    assert.equal(realizadasDoCurador.statusCode, 403);
    assert.equal(minhasDaGestao.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('conferência recusa Não se aplica fora do Critério que admite esse estado', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia().map((criterio) =>
          criterio.nome === 'Saudação'
            ? { ...criterio, estado: 'Não se aplica' }
            : criterio
        ),
        notaDaRegua: 8.5,
        notaDaAvaliacaoDaIa: 8.5
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});
