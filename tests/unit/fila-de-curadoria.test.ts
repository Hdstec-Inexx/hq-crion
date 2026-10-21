import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { destinoDaLista, periodoMesCivil } from '../../packages/contracts/src/recorte.js';
import { areasDaCasca, destinoInicial } from '../../packages/contracts/src/casca.js';
import { reguaUnica } from '../../apps/api/src/modules/regua/regua-unica.js';

process.env.NODE_ENV = 'test';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

function checklistDaConferencia(
  estadoDe: (nome: string) => 'Atendido' | 'Não atendido' | 'Não se aplica' = (nome) =>
    nome === 'Validação de e-mail' ? 'Não se aplica' : 'Atendido'
) {
  return reguaUnica.criterios.map((criterio) => ({
    nome: criterio.nome,
    estado: estadoDe(criterio.nome)
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

test("destinoInicial('Curador') é /fila-de-curadoria", () => {
  assert.equal(destinoInicial('Curador'), '/fila-de-curadoria');
});

test('GET /fila-de-curadoria inclui o array motivos na resposta', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'GET',
      url: '/fila-de-curadoria',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { motivos: string[] };
    assert.ok(Array.isArray(body.motivos));
    assert.ok(body.motivos.length > 0);
    const ordenados = [...body.motivos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    assert.deepEqual(body.motivos, ordenados);
  } finally {
    await app.close();
  }
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
    assert.equal(detalhe.avaliacaoDoCurador.nota, 10);
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
    assert.ok(
      detalhe.avaliacaoDoCurador.criterios.every((criterio: { chave?: string }) => criterio.chave)
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
        checklist: checklistDaConferencia()
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
        )
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('conferência com todos Atendido grava a soma da Régua e o selo Aprovado', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const gravacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia(() => 'Atendido')
      }
    });

    assert.equal(gravacao.statusCode, 200, gravacao.body);
    assert.equal(gravacao.json().avaliacaoDoCurador.nota, 10);
    assert.equal(gravacao.json().avaliacaoDoCurador.aprovacao, 'Aprovado');
    assert.equal('comentario' in gravacao.json().avaliacaoDoCurador, false);
  } finally {
    await app.close();
  }
});

test('Não se aplica na Validação de e-mail conserva o peso e não altera a Avaliação da IA', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const headers = { authorization: `Bearer ${sessaoCurador}` };
    const antes = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers
    });
    const gravacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers,
      payload: { checklist: checklistDaConferencia() }
    });

    assert.equal(antes.statusCode, 200, antes.body);
    assert.equal(gravacao.statusCode, 200, gravacao.body);
    const iaAntes = antes.json().avaliacaoDaIa;
    const iaDepois = gravacao.json().avaliacaoDaIa;
    const curador = gravacao.json().avaliacaoDoCurador;
    const email = curador.criterios.find(
      (criterio: { nome: string }) => criterio.nome === 'Validação de e-mail'
    );

    assert.equal(curador.nota, 10);
    assert.equal(email.estado, 'Não se aplica');
    assert.equal(email.pontos, 0.5);
    assert.equal(iaDepois.nota, iaAntes.nota);
    assert.equal(iaDepois.resumo, iaAntes.resumo);
    assert.deepEqual(iaDepois.falhasIdentificadas, iaAntes.falhasIdentificadas);
    assert.equal('comentario' in curador, false);
  } finally {
    await app.close();
  }
});

test('conferência recusa nota digitada, critério ausente e critério desconhecido', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const headers = { authorization: `Bearer ${sessaoCurador}` };
    const comNota = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers,
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 8
      }
    });
    const incompleta = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers,
      payload: { checklist: checklistDaConferencia().slice(1) }
    });
    const desconhecida = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers,
      payload: {
        checklist: [
          ...checklistDaConferencia().slice(1),
          { nome: 'Critério fora da Avaliação', estado: 'Atendido' }
        ]
      }
    });
    const detalhe = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers
    });

    assert.equal(comNota.statusCode, 400);
    assert.equal(incompleta.statusCode, 400);
    assert.equal(desconhecida.statusCode, 400);
    assert.equal(detalhe.json().avaliacaoDoCurador, undefined);
  } finally {
    await app.close();
  }
});

test('conferência recusa checklist acima do teto da gravação da IA', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const response = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: Array.from({ length: 31 }, (_, indice) => ({
          nome: `Critério ${indice}`,
          estado: 'Atendido'
        }))
      }
    });

    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});

test('segunda conferência edita a avaliação do Curador existente', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const headers = { authorization: `Bearer ${sessaoCurador}` };
    const primeira = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers,
      payload: { checklist: checklistDaConferencia(() => 'Atendido') }
    });
    const segunda = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers,
      payload: {
        checklist: checklistDaConferencia(() => 'Não atendido'),
        comentario: 'nova leitura'
      }
    });

    assert.equal(primeira.statusCode, 200, primeira.body);
    assert.equal(segunda.statusCode, 200, segunda.body);
    assert.equal(segunda.json().avaliacaoDoCurador.nota, 0);
    assert.equal(segunda.json().avaliacaoDoCurador.comentario, 'nova leitura');
    const detalhe = await app.inject({
      method: 'GET',
      url: '/atendimentos/a3',
      headers
    });
    assert.equal(detalhe.json().avaliacaoDoCurador.nota, 0);
    assert.equal(detalhe.json().avaliacaoDoCurador.comentario, 'nova leitura');
  } finally {
    await app.close();
  }
});

test('edição de conferência por Curador e Admin: permissões, métodos POST/PUT e autoria', async () => {
  const app = await buildApp();

  try {
    const sessaoCuradorCarla = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');

    // Admin cria um segundo Curador (Marcos)
    const novoCuradorRes = await app.inject({
      method: 'POST',
      url: '/perfis',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        nome: 'Marcos Curador',
        email: 'marcos.curador@crion',
        papel: 'Curador',
        senha: 'senha-marcos-123'
      }
    });
    assert.equal(novoCuradorRes.statusCode, 201);

    const loginMarcos = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'marcos.curador@crion', senha: 'senha-marcos-123' }
    });
    const sessaoCuradorMarcos = loginMarcos.json().sessao;

    // 1. Carla cria conferência inicial em a3
    const criacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCuradorCarla}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido') }
    });
    assert.equal(criacao.statusCode, 200, criacao.body);
    assert.equal(criacao.json().avaliacaoDoCurador.curador, 'Carla Mendes');

    // 2. Marcos (outro Curador) edita conferência existente via PUT: autoria transfere para Marcos
    const edicaoMarcos = await app.inject({
      method: 'PUT',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCuradorMarcos}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido'), comentario: 'revisado por marcos' }
    });
    assert.equal(edicaoMarcos.statusCode, 200, edicaoMarcos.body);
    assert.equal(edicaoMarcos.json().avaliacaoDoCurador.curador, 'Marcos Curador');
    assert.equal(edicaoMarcos.json().avaliacaoDoCurador.comentario, 'revisado por marcos');

    // 3. Admin edita conferência existente via POST: autoria de Marcos é preservada
    const edicaoAdmin = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido'), comentario: 'ajuste operacional do admin' }
    });
    assert.equal(edicaoAdmin.statusCode, 200, edicaoAdmin.body);
    assert.equal(edicaoAdmin.json().avaliacaoDoCurador.curador, 'Marcos Curador');
    assert.equal(edicaoAdmin.json().avaliacaoDoCurador.comentario, 'ajuste operacional do admin');

    // 4. Gestão tenta editar conferência existente: 403 Forbidden
    const edicaoGestao = await app.inject({
      method: 'PUT',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoGestao}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido') }
    });
    assert.equal(edicaoGestao.statusCode, 403);

    // 5. Admin tenta criar conferência inicial em atendimento sem avaliação prévia: 403 Forbidden
    const criacaoAdminSemAvaliacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido') }
    });
    assert.equal(criacaoAdminSemAvaliacao.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('curadaEm é exposto na conferência inicial e atualizado ao editar a conferência', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');

    // 1. Carla cria conferência inicial em a3
    const criacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: { checklist: checklistDaConferencia(() => 'Atendido') }
    });
    assert.equal(criacao.statusCode, 200);
    const corpoCriacao = criacao.json();
    assert.ok(corpoCriacao.curadaEm, 'corpo da criação deve ter curadaEm na raiz');
    assert.ok(corpoCriacao.avaliacaoDoCurador?.curadaEm, 'avaliacaoDoCurador deve ter curadaEm');
    const t1 = new Date(corpoCriacao.curadaEm).getTime();
    assert.ok(!Number.isNaN(t1), 'curadaEm deve ser um timestamp ISO válido');

    // Aguarda um instante para garantir timestamps distintos
    await new Promise((resolve) => setTimeout(resolve, 20));

    // 2. Admin edita conferência existente: curadaEm deve refletir o instante da edição
    const edicao = await app.inject({
      method: 'PUT',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoAdmin}` },
      payload: {
        checklist: checklistDaConferencia(() => 'Atendido'),
        comentario: 'edição com nova data'
      }
    });
    assert.equal(edicao.statusCode, 200);
    const corpoEdicao = edicao.json();
    assert.ok(corpoEdicao.curadaEm, 'corpo da edição deve ter curadaEm na raiz');
    assert.ok(corpoEdicao.avaliacaoDoCurador?.curadaEm, 'avaliacaoDoCurador deve ter curadaEm atualizado');
    const t2 = new Date(corpoEdicao.curadaEm).getTime();
    assert.ok(t2 >= t1, 'curadaEm atualizado deve ser maior ou igual a t1');

    // 3. GET /atendimentos/a3 deve refletir a data atualizada
    const detalhe = await app.inject({
      method: 'GET',
      url: '/atendimentos/a3',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    assert.equal(detalhe.statusCode, 200);
    const corpoDetalhe = detalhe.json();
    assert.equal(corpoDetalhe.curadaEm, corpoEdicao.curadaEm);
    assert.equal(corpoDetalhe.avaliacaoDoCurador.curadaEm, corpoEdicao.avaliacaoDoCurador.curadaEm);

    // 4. Listagem /atendimentos inclui curadaEm para curados e null para pendentes
    const listagem = await app.inject({
      method: 'GET',
      url: '/atendimentos',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    assert.equal(listagem.statusCode, 200);
    const itens = listagem.json().itens;
    const itemA3 = itens.find((it: { id: string }) => it.id === 'a3');
    const itemA1 = itens.find((it: { id: string }) => it.id === 'a1');
    assert.ok(itemA3);
    assert.equal(itemA3.curadaEm, corpoEdicao.curadaEm);
    assert.ok(itemA1);
    assert.equal(itemA1.curadaEm, null);
  } finally {
    await app.close();
  }
});


test('Concordância por nota compara a nota gravada da IA com a soma derivada', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const { inicio, fim } = periodoMesCivil(new Date());
    const gravacao = await app.inject({
      method: 'POST',
      url: '/atendimentos/a1/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: { checklist: checklistDaConferencia() }
    });
    const dashboard = await app.inject({
      method: 'GET',
      url: `/dashboard?administradora=Affix&agente=affix-0800&inicio=${inicio}&fim=${fim}`,
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });

    assert.equal(gravacao.statusCode, 200, gravacao.body);
    assert.equal(gravacao.json().avaliacaoDaIa.nota, 8.5);
    assert.equal(gravacao.json().avaliacaoDoCurador.nota, 10);
    assert.deepEqual(
      gravacao.json().avaliacaoDaIa.criterios.map((criterio: { nome: string; estado: string }) => [
        criterio.nome,
        criterio.estado
      ]),
      gravacao.json().avaliacaoDoCurador.criterios.map((criterio: { nome: string; estado: string }) => [
        criterio.nome,
        criterio.estado
      ])
    );
    assert.equal(dashboard.statusCode, 200, dashboard.body);
    assert.equal(dashboard.json().paineis.concordancia.nota, 0);
    assert.equal(dashboard.json().paineis.concordancia.criterios, 100);
  } finally {
    await app.close();
  }
});

test('o formulário da Conferência humana é a lista e esconde a Avaliação da IA', () => {
  const detalhe = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/DetalheAtendimento.tsx'),
    'utf8'
  );

  assert.match(detalhe, /Conferência humana/);
  assert.match(detalhe, /Checklist do Curador/);
  assert.match(detalhe, /Os estados começam iguais aos da IA\. Confirme ou corrija cada Critério\./);
  assert.match(detalhe, /type="radio"/);
  assert.match(detalhe, /Comentário da revisão \(opcional\)/);
  assert.match(detalhe, /Salvar conferência/);
  assert.match(detalhe, /Resumo não informado\./);
  assert.match(detalhe, /Nenhuma falha identificada\./);
  assert.match(detalhe, /avaliacao-score/);
  assert.match(detalhe, /is-fail/);
  assert.equal(detalhe.includes('notaDaRegua'), false);
  assert.equal(detalhe.includes('<select'), false);
  assert.match(detalhe, /!conferenciaAberta\(perfil\.papel, atendimento\) \? \(/);
  assert.match(detalhe, /<FormularioConferencia\s+key=\{atendimento\.id\}/);
  const formulario = detalhe.slice(detalhe.indexOf('function FormularioConferencia'));
  const lista = formulario.indexOf('conferencia-lista');
  const selo = formulario.indexOf('avaliacao-score');
  const notaDaIa = formulario.indexOf('Nota da Avaliação da IA');
  const falhas = formulario.indexOf('Falhas Identificadas');
  const resumo = formulario.indexOf('Resumo do Atendimento');

  assert.ok(lista >= 0 && lista < selo, 'o selo fica depois das linhas');
  assert.ok(selo < notaDaIa && notaDaIa < falhas && falhas < resumo);
});

test('DetalheAtendimento oferece ação Editar conferência para Curador e Admin com Cancelar e pré-preenchimento', () => {
  const detalhe = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/DetalheAtendimento.tsx'),
    'utf8'
  );

  // Botão "Editar conferência"
  assert.match(detalhe, /Editar conferência/);
  // Verificação de permissão: Curador e Admin podem editar, Gestão não
  assert.match(detalhe, /perfil\.papel === 'Curador' \|\| perfil\.papel === 'Admin'/);
  assert.match(detalhe, /atendimento\.avaliacaoDoCurador/);
  // Botão "Cancelar"
  assert.match(detalhe, /Cancelar/);
  // Pré-preenchimento dos estados do Curador quando em edição
  assert.match(detalhe, /atendimento\.avaliacaoDoCurador\.criterios/);
  // Pré-preenchimento do comentário vigente
  assert.match(detalhe, /defaultValue=\{atendimento\.avaliacaoDoCurador\?\.comentario \?\? ''\}/);
});
