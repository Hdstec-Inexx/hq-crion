import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import {
  destinoDaLista,
  periodoMesCivil,
  proximoDestinoDoPercurso
} from '../../packages/contracts/src/recorte.js';
import { areasDaCasca } from '../../packages/contracts/src/casca.js';
import { consultaDoPercurso } from '../../apps/api/src/modules/atendimentos/consulta.js';
import type { RegistroDeAtendimento } from '../../apps/api/src/modules/atendimentos/registro.js';
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

function checklistDaConferencia() {
  return reguaUnica.criterios.map((criterio) => ({
    nome: criterio.nome,
    estado: criterio.nome === 'Validação de e-mail' ? 'Não se aplica' : 'Atendido',
    pontos: criterio.valor,
    critico: criterio.critico
  }));
}

const buscaDoPercurso = new URLSearchParams(
  'lista=/manutencao&administradora=Alter&agente=alter-1&inicio=2026-09-01&fim=2026-09-30&status=Resolvido&conversa=conv-a2&pagina=2'
);

function comentarioDoPercurso(entrada: {
  id: string;
  comentarioId: string;
  texto: string;
  status: 'Pendente' | 'Resolvido';
  iniciadoEm: string;
}): RegistroDeAtendimento {
  return {
    id: entrada.id,
    comentarioId: entrada.comentarioId,
    comentarioStatus: entrada.status,
    administradora: 'Alter',
    agente: 'Clara Alter',
    agenteId: 'alter-1',
    iniciadoEm: entrada.iniciadoEm,
    motivo: 'Boleto',
    nota: 6,
    status: 'Concluído',
    curadoria: true,
    conversa: 'conv-a2',
    transcricao: [],
    avaliacaoDoCurador: {
      nota: 6,
      aprovacao: 'Reprovado',
      criterios: [
        { nome: 'Comentário', estado: 'Não se aplica', pontos: 1, critico: false }
      ],
      notaDaAvaliacaoDaIa: 6,
      curador: 'Carla Mendes',
      comentario: entrada.texto
    }
  };
}

test('dois Comentários pendentes no mesmo Atendimento mantêm o percurso nele', () => {
  const registros = [
    comentarioDoPercurso({
      id: 'a2',
      comentarioId: 'c2',
      texto: 'Segundo',
      status: 'Pendente',
      iniciadoEm: '2026-09-11T10:03:00-03:00'
    }),
    comentarioDoPercurso({
      id: 'a2',
      comentarioId: 'c1',
      texto: 'Primeiro',
      status: 'Pendente',
      iniciadoEm: '2026-09-11T10:03:00-03:00'
    }),
    comentarioDoPercurso({
      id: 'a3',
      comentarioId: 'c3',
      texto: 'Outro',
      status: 'Pendente',
      iniciadoEm: '2026-09-11T11:40:00-03:00'
    })
  ];
  const atual = { id: 'a2', iniciadoEm: '2026-09-11T10:03:00-03:00' };
  const recorte = { administradora: null, agente: null } as const;
  const comDois = consultaDoPercurso(registros, atual, recorte, {});
  const comUm = consultaDoPercurso(
    registros.map((item) =>
      item.comentarioId === 'c1' ? { ...item, comentarioStatus: 'Resolvido' as const } : item
    ),
    atual,
    recorte,
    {}
  );

  assert.equal(comDois.pendentesNoAtendimento, 2);
  assert.equal(comDois.comentarioPendenteId, 'c1');
  assert.equal(comDois.textoPendente, 'Primeiro');
  assert.equal(comDois.proximoAtendimentoId, null);
  assert.equal(comUm.pendentesNoAtendimento, 1);
  assert.equal(comUm.comentarioPendenteId, 'c2');
  assert.equal(comUm.textoPendente, 'Segundo');
  assert.equal(comUm.proximoAtendimentoId, null);
});

test('próximo destino permanece no Atendimento enquanto há Comentário pendente', () => {
  assert.equal(
    proximoDestinoDoPercurso({
      atendimentoAtual: 'a2',
      pendentesNoAtendimento: 2,
      proximoAtendimentoId: 'a3',
      busca: buscaDoPercurso
    }),
    '/atendimentos/a2?lista=%2Fmanutencao&administradora=Alter&agente=alter-1&inicio=2026-09-01&fim=2026-09-30&status=Resolvido&conversa=conv-a2'
  );
});

test('próximo destino abre o Atendimento seguinte e, sem ele, volta à fila com filtros', () => {
  assert.equal(
    proximoDestinoDoPercurso({
      atendimentoAtual: 'a2',
      pendentesNoAtendimento: 0,
      proximoAtendimentoId: 'a3',
      busca: buscaDoPercurso
    }),
    '/atendimentos/a3?lista=%2Fmanutencao&administradora=Alter&agente=alter-1&inicio=2026-09-01&fim=2026-09-30&status=Resolvido&conversa=conv-a2'
  );
  assert.equal(
    proximoDestinoDoPercurso({
      atendimentoAtual: 'a2',
      pendentesNoAtendimento: 0,
      proximoAtendimentoId: null,
      busca: buscaDoPercurso
    }),
    '/manutencao?administradora=Alter&agente=alter-1&inicio=2026-09-01&fim=2026-09-30&status=Resolvido&conversa=conv-a2'
  );
});

test('resolver na lista não inicia o percurso; o detalhe da fila sim', () => {
  const fila = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/FilaDeManutencao.tsx'),
    'utf8'
  );
  const detalhe = readFileSync(
    join(raiz, 'apps/web/src/features/atendimentos/DetalheAtendimento.tsx'),
    'utf8'
  );

  assert.doesNotMatch(fila, /proximoDestinoDoPercurso|buscarPercursoDaFila|useNavigate/);
  assert.match(detalhe, /proximoDestinoDoPercurso/);
  assert.match(detalhe, /buscarPercursoDaFila/);
  assert.match(detalhe, /destinoDaFilaDeManutencao/);
});

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

test('GET /manutencao filtra Comentários pela conversa', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const daConversa = await app.inject({
      method: 'GET',
      url: '/manutencao?conversa=conv-a2',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const outra = await app.inject({
      method: 'GET',
      url: '/manutencao?conversa=conv-a1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.deepEqual(
      daConversa.json().itens.map((item: { atendimentoId: string }) => item.atendimentoId),
      ['a2']
    );
    assert.equal(outra.json().itens.length, 0);
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
    const { inicio, fim } = periodoMesCivil(new Date());
    const noPeriodo = await app.inject({
      method: 'GET',
      url: `/manutencao?inicio=${inicio}&fim=${fim}`,
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
    assert.ok(
      noPeriodo
        .json()
        .itens.some((item: { atendimentoId: string }) => item.atendimentoId === 'a2')
    );
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

    const antes = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Pendente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
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
    const recusaAnonima = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver'
    });
    const aindaPendente = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Pendente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const resolucao = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const repetida = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const pendentes = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Pendente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const resolvidos = await app.inject({
      method: 'GET',
      url: '/manutencao?status=Resolvido',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.ok(
      antes
        .json()
        .itens.some((item: { atendimentoId: string; status: string }) => {
          return item.atendimentoId === 'a2' && item.status === 'Pendente';
        })
    );
    assert.equal(recusaGestao.statusCode, 403);
    assert.equal(recusaCurador.statusCode, 403);
    assert.equal(recusaAnonima.statusCode, 401);
    assert.ok(
      aindaPendente
        .json()
        .itens.some((item: { atendimentoId: string; status: string }) => {
          return item.atendimentoId === 'a2' && item.status === 'Pendente';
        })
    );
    assert.equal(resolucao.statusCode, 200);
    assert.equal(resolucao.json().status, 'Resolvido');
    assert.equal(repetida.statusCode, 409);
    assert.equal(
      pendentes
        .json()
        .itens.some((item: { atendimentoId: string }) => item.atendimentoId === 'a2'),
      false
    );
    assert.ok(
      resolvidos
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

test('Gestão e Curador não operam o percurso da fila', async () => {
  const app = await buildApp();

  try {
    const sessaoGestao = await sessaoDe(app, 'ana.souza@crion');
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const recusaGestao = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2',
      headers: { authorization: `Bearer ${sessaoGestao}` }
    });
    const recusaCurador = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2',
      headers: { authorization: `Bearer ${sessaoCurador}` }
    });
    const recusaAnonima = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2'
    });

    assert.equal(recusaGestao.statusCode, 403);
    assert.equal(recusaCurador.statusCode, 403);
    assert.equal(recusaAnonima.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('com Comentário pendente no Atendimento, o percurso não abre o seguinte', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    const conferencia = await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 9,
        notaDaAvaliacaoDaIa: 9,
        comentario: 'Rever a Clara Conectaplan.'
      }
    });
    const percurso = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(conferencia.statusCode, 200);
    assert.equal(percurso.statusCode, 200);
    assert.equal(percurso.json().pendentesNoAtendimento, 1);
    assert.equal(percurso.json().comentarioPendenteId, 'a2');
    assert.equal(percurso.json().textoPendente, 'Rever o prompt de boleto na Clara Alter.');
    assert.equal(percurso.json().proximoAtendimentoId, null);
  } finally {
    await app.close();
  }
});

test('resolver o último pendente consulta o próximo no mesmo filtro', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    await app.inject({
      method: 'POST',
      url: '/atendimentos/a3/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 9,
        notaDaAvaliacaoDaIa: 9,
        comentario: 'Rever a Clara Conectaplan.'
      }
    });
    const resolucao = await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const seguinte = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2&status=Resolvido',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const outraConversa = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2&conversa=conv-a2&status=Resolvido',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const mesmoRecorte = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2&administradora=Alter&agente=alter-1',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(resolucao.statusCode, 200);
    assert.equal('destino' in resolucao.json(), false);
    assert.equal(seguinte.statusCode, 200);
    assert.equal(seguinte.json().pendentesNoAtendimento, 0);
    assert.equal(seguinte.json().proximoAtendimentoId, 'a3');
    assert.equal(outraConversa.json().proximoAtendimentoId, null);
    assert.equal(mesmoRecorte.json().proximoAtendimentoId, null);
  } finally {
    await app.close();
  }
});

test('sem posterior, o percurso volta à fila e deixa o pendente anterior na lista', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    await app.inject({
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
    await app.inject({
      method: 'POST',
      url: '/manutencao/a2/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const percurso = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });

    assert.equal(percurso.statusCode, 200);
    assert.equal(percurso.json().pendentesNoAtendimento, 0);
    assert.equal(percurso.json().proximoAtendimentoId, null);
    assert.equal(
      proximoDestinoDoPercurso({
        atendimentoAtual: 'a2',
        pendentesNoAtendimento: 0,
        proximoAtendimentoId: null,
        busca: new URLSearchParams('administradora=Affix&agente=affix-0800&conversa=conv-a1')
      }),
      '/manutencao?administradora=Affix&agente=affix-0800&conversa=conv-a1'
    );
  } finally {
    await app.close();
  }
});

test('sem próximo no período, a consulta volta à fila com Recorte e filtros', async () => {
  const app = await buildApp();

  try {
    const sessaoCurador = await sessaoDe(app, 'carla.mendes@crion');
    const sessaoAdmin = await sessaoDe(app, 'bruno.alves@crion');
    await app.inject({
      method: 'POST',
      url: '/atendimentos/a-fora/conferencia',
      headers: { authorization: `Bearer ${sessaoCurador}` },
      payload: {
        checklist: checklistDaConferencia(),
        notaDaRegua: 5,
        notaDaAvaliacaoDaIa: 5,
        comentario: 'Comentário fora do mês civil.'
      }
    });
    await app.inject({
      method: 'POST',
      url: '/manutencao/a-fora/resolver',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const noMes = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a-fora',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const em2020 = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a-fora&inicio=2020-01-01&fim=2020-01-31&administradora=Affix&agente=affix-0800&status=Pendente',
      headers: { authorization: `Bearer ${sessaoAdmin}` }
    });
    const busca = new URLSearchParams(
      'administradora=Affix&agente=affix-0800&inicio=2020-01-01&fim=2020-01-31&status=Pendente&lista=/manutencao'
    );

    assert.equal(noMes.statusCode, 200);
    assert.equal(noMes.json().proximoAtendimentoId, 'a2');
    assert.equal(em2020.statusCode, 200);
    assert.equal(em2020.json().pendentesNoAtendimento, 0);
    assert.equal(em2020.json().proximoAtendimentoId, null);
    assert.equal(
      proximoDestinoDoPercurso({
        atendimentoAtual: 'a-fora',
        pendentesNoAtendimento: em2020.json().pendentesNoAtendimento,
        proximoAtendimentoId: em2020.json().proximoAtendimentoId,
        busca
      }),
      '/manutencao?administradora=Affix&agente=affix-0800&inicio=2020-01-01&fim=2020-01-31&status=Pendente'
    );
  } finally {
    await app.close();
  }
});

test('GET /manutencao/proximo rejeita Recorte inválido e Atendimento ausente', async () => {
  const app = await buildApp();

  try {
    const sessao = await sessaoDe(app, 'bruno.alves@crion');
    const recorte = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=a2&administradora=Affix&agente=alter-1',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const ausente = await app.inject({
      method: 'GET',
      url: '/manutencao/proximo?atendimento=nao-existe',
      headers: { authorization: `Bearer ${sessao}` }
    });
    const idLongo = await app.inject({
      method: 'GET',
      url: `/manutencao/proximo?atendimento=${'a'.repeat(201)}`,
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(recorte.statusCode, 400);
    assert.equal(ausente.statusCode, 404);
    assert.equal(idLongo.statusCode, 400);
  } finally {
    await app.close();
  }
});
