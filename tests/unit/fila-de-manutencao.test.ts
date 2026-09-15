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

test('voltar à Fila de Manutenção preserva Recorte na URL', () => {
  assert.equal(
    destinoDaLista(
      { administradora: 'Affix', agente: 'affix-0800' },
      '/manutencao'
    ),
    '/manutencao?administradora=Affix&agente=affix-0800'
  );
});

test('casca do Admin tem Manutenção; o h1 usa Fila de Manutenção', () => {
  const area = areasDaCasca('Admin').find((item) => item.rota === '/manutencao');

  assert.equal(area?.rotulo, 'Manutenção');
  assert.equal(area?.titulo, 'Fila de Manutenção');
  assert.equal(
    areasDaCasca('Gestão').some((item) => item.rota === '/manutencao'),
    false
  );
  assert.equal(
    areasDaCasca('Curador').some((item) => item.rota === '/manutencao'),
    false
  );
});

test('só o Admin opera a Fila de Manutenção', async () => {
  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    const listaAdmin = await app.inject({
      method: 'GET',
      url: '/manutencao',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const listaGestao = await app.inject({
      method: 'GET',
      url: '/manutencao',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    const listaCurador = await app.inject({
      method: 'GET',
      url: '/manutencao',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });

    assert.equal(listaAdmin.statusCode, 200);
    assert.equal(listaGestao.statusCode, 403);
    assert.equal(listaCurador.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('cada Comentário da fila liga ao Atendimento de origem', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const detalhe = await app.inject({
      method: 'GET',
      url: '/atendimentos/a2',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const origem = detalhe.json() as {
      iniciadoEm: string;
      administradora: string;
      agente: string;
      agenteId: string;
      conversa: string;
    };
    const response = await app.inject({
      method: 'GET',
      url: '/manutencao',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const item = response
      .json()
      .itens.find((comentario: { atendimentoId: string }) => comentario.atendimentoId === 'a2');

    assert.ok(item);
    assert.equal(item.administradora, origem.administradora);
    assert.equal(item.agente, origem.agente);
    assert.equal(item.agenteId, origem.agenteId);
    assert.equal(item.conversa, origem.conversa);
    assert.equal(item.data, origem.iniciadoEm);
    assert.equal(item.status, 'Pendente');
    assert.equal(item.texto, 'Rever o prompt de boleto na Clara Alter.');
  } finally {
    await app.close();
  }
});

test('GET /manutencao recorta pela Administradora e Agente da URL', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const recorteAlter = await app.inject({
      method: 'GET',
      url: '/manutencao?administradora=Alter&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const recorteAffix = await app.inject({
      method: 'GET',
      url: '/manutencao?administradora=Affix&agente=affix-0800',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(recorteAlter.statusCode, 200);
    assert.deepEqual(recorteAlter.json().recorte, {
      administradora: 'Alter',
      agente: 'alter-1'
    });
    assert.deepEqual(
      recorteAlter.json().itens.map((item: { atendimentoId: string }) => item.atendimentoId),
      ['a2']
    );
    assert.equal(recorteAffix.statusCode, 200);
    assert.equal(
      recorteAffix
        .json()
        .itens.some((item: { atendimentoId: string }) => item.atendimentoId === 'a2'),
      false
    );
  } finally {
    await app.close();
  }
});

test('GET /manutencao rejeita Recorte inválido', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/manutencao?administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('GET /manutencao filtra Comentários por status e data', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const pendentes = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Pendente',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const resolvidos = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Resolvido',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const foraDoPeriodo = await app.inject({
      method: 'GET',
      url: '/manutencao?inicio=2020-01-01&fim=2020-01-31',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.ok(
      pendentes
        .json()
        .itens.some((item: { atendimentoId: string }) => item.atendimentoId === 'a2')
    );
    assert.equal(
      resolvidos
        .json()
        .itens.some((item: { atendimentoId: string }) => item.atendimentoId === 'a2'),
      false
    );
    assert.equal(foraDoPeriodo.json().itens.length, 0);
  } finally {
    await app.close();
  }
});

test('transição Pendente → Resolvido só como Admin', async () => {
  const app = await buildApp();

  try {
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');

    const recusaGestao = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    const recusaCurador = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const resolucao = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const depois = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Resolvido',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(recusaGestao.statusCode, 403);
    assert.equal(recusaCurador.statusCode, 403);
    assert.equal(resolucao.statusCode, 200);
    assert.equal(resolucao.json().status, 'Resolvido');
    assert.ok(
      depois
        .json()
        .itens.some((item: { atendimentoId: string; status: string }) => {
          return item.atendimentoId === 'a2' && item.status === 'Resolvido';
        })
    );
  } finally {
    await app.close();
  }
});

test('comentário da conferência entra na fila como Pendente', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');

    const gravacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 8.5,
        notaDaAvaliacaoDaIa: 8.5,
        comentario: 'Ajustar o tom da Clara Affix no 0800.'
      }
    });
    const fila = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Pendente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(gravacao.statusCode, 200);
    const item = fila
      .json()
      .itens.find((comentario: { atendimentoId: string }) => comentario.atendimentoId === 'a1');

    assert.ok(item);
    assert.equal(item.status, 'Pendente');
    assert.equal(item.texto, 'Ajustar o tom da Clara Affix no 0800.');
  } finally {
    await app.close();
  }
});
