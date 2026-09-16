import {
  atendimentoDetalheSchema,
  conferenciaRequestSchema,
  custoVisivelPara,
  downloadVisivelPara,
  filaDeManutencaoResponseSchema,
  listagemResponseSchema,
  monitoramentoDetalheSchema,
  comentarioDaFilaSchema,
  type AtendimentoDetalhe,
  type AtendimentoListItem,
  type EstadoDoCriterio,
  type MonitoramentoDetalhe
} from '@hq-crion/contracts/atendimento';
import { dashboardResponseSchema } from '@hq-crion/contracts/dashboard';
import type { Papel } from '@hq-crion/contracts/perfil';
import { lerRecorte, periodoMesCivil } from '@hq-crion/contracts/recorte';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { perfilDaAutorizacao, registroDaAutorizacao } from '../perfil/sessoes.js';
import { reguaUnica } from '../regua/regua-unica.js';

type RegistroDeAtendimento = AtendimentoDetalhe & {
  curadorId?: string;
  concluidoEm?: string;
  comentarioStatus?: 'Pendente' | 'Resolvido';
};

type ModoDaListagem = 'todos' | 'fila' | 'minhas' | 'realizadas' | 'monitoramento';

function iniciadoNoMesCorrente(dia: number, hora: string) {
  const { inicio } = periodoMesCivil(new Date());
  const [ano, mes] = inicio.split('-');

  return `${ano}-${mes}-${String(Math.min(dia, 28)).padStart(2, '0')}T${hora}-03:00`;
}

const catalogoBase: AtendimentoListItem[] = [
  {
    id: 'a1',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: iniciadoNoMesCorrente(11, '09:12:00'),
    motivo: 'Rede credenciada',
    nota: 8.5,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-a1',
    custo: 'R$ 1,42'
  },
  {
    id: 'a2',
    administradora: 'Alter',
    agente: 'Clara Alter',
    agenteId: 'alter-1',
    iniciadoEm: iniciadoNoMesCorrente(11, '10:03:00'),
    motivo: 'Boleto',
    nota: 6.0,
    status: 'Concluído',
    curadoria: true,
    conversa: 'conv-a2',
    custo: 'R$ 0,98'
  },
  {
    id: 'a3',
    administradora: 'Conectaplan',
    agente: 'Clara Conectaplan',
    agenteId: 'conecta-1',
    iniciadoEm: iniciadoNoMesCorrente(11, '11:40:00'),
    motivo: 'Não informado',
    nota: 9.0,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-a3',
    custo: 'R$ 1,10'
  },
  {
    id: 'a4',
    administradora: 'Affix',
    agente: 'Clara Affix WhatsApp',
    agenteId: 'affix-wa',
    iniciadoEm: iniciadoNoMesCorrente(11, '12:15:00'),
    motivo: 'Carência',
    nota: 7.5,
    status: 'Em andamento',
    curadoria: false,
    conversa: 'conv-a4',
    custo: 'R$ 0,40'
  },
  {
    id: 'a-fora',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: '2020-01-15T10:00:00-03:00',
    motivo: 'Carência',
    nota: 5,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-fora',
    custo: 'R$ 0,10'
  }
];

const { inicio: inicioDoMes } = periodoMesCivil(new Date());
const extrasDoMes: AtendimentoListItem[] = Array.from({ length: 47 }, (_, index) => {
  return {
    id: `extra-${index + 1}`,
    administradora: 'Conectaplan',
    agente: 'Clara Conectaplan',
    agenteId: 'conecta-1',
    iniciadoEm: `${inicioDoMes}T08:00:00-03:00`,
    motivo: 'Extra',
    nota: 8,
    status: 'Concluído',
    curadoria: false,
    conversa: `conv-extra-${index + 1}`,
    custo: 'R$ 0,01'
  };
});

function criteriosDaAvaliacao(conferida: boolean) {
  return reguaUnica.criterios.map((criterio) => {
    let estado: EstadoDoCriterio = 'Atendido';

    if (criterio.nome === 'Validação de e-mail') {
      estado = 'Não se aplica';
    } else if (conferida && criterio.nome === 'Informação de Protocolo') {
      estado = 'Não atendido';
    }

    return {
      nome: criterio.nome,
      estado,
      pontos: criterio.valor,
      critico: criterio.critico
    };
  });
}

function avaliacaoDe(nota: number, conferida: boolean) {
  return {
    nota,
    aprovacao: (nota >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado') as
      | 'Aprovado'
      | 'Reprovado',
    criterios: criteriosDaAvaliacao(conferida)
  };
}

function detalheDe(item: AtendimentoListItem): RegistroDeAtendimento {
  const concluido = item.status === 'Concluído';

  return {
    ...item,
    audio: `/media/${item.id}.wav`,
    downloadDeAudio: `/media/${item.id}.wav`,
    transcricao: [
      {
        locutor: 'Agente de Voz',
        quando: '0:04',
        texto: `Olá, aqui é a ${item.agente} da ${item.administradora}. Em que posso ajudar?`
      },
      {
        locutor: 'Cliente',
        quando: '0:12',
        texto: `Preciso falar sobre ${item.motivo.toLowerCase()}.`
      },
      {
        locutor: 'Agente de Voz',
        quando: '0:18',
        texto: 'Claro. Me confirma o CPF do titular para eu localizar o contrato.'
      }
    ],
    avaliacaoDaIa: avaliacaoDe(item.nota, item.curadoria),
    ...(concluido ? { concluidoEm: item.iniciadoEm } : {}),
    ...(item.curadoria
      ? {
          avaliacaoDoCurador: {
            ...avaliacaoDe(6, true),
            notaDaAvaliacaoDaIa: item.nota,
            ...(item.id === 'a2'
              ? { comentario: 'Rever o prompt de boleto na Clara Alter.' }
              : {})
          },
          curadorId: 'perfil-carla',
          ...(item.id === 'a2' ? { comentarioStatus: 'Pendente' as const } : {})
        }
      : {})
  };
}

function itemDaFilaDeManutencao(item: RegistroDeAtendimento) {
  const texto = item.avaliacaoDoCurador?.comentario;

  if (!texto) {
    return null;
  }

  return {
    id: item.id,
    atendimentoId: item.id,
    administradora: item.administradora,
    agente: item.agente,
    agenteId: item.agenteId,
    conversa: item.conversa,
    data: item.iniciadoEm,
    texto,
    status: item.comentarioStatus ?? 'Pendente'
  };
}

function itemDaListagem(detalhe: AtendimentoDetalhe): AtendimentoListItem {
  return {
    id: detalhe.id,
    administradora: detalhe.administradora,
    agente: detalhe.agente,
    agenteId: detalhe.agenteId,
    iniciadoEm: detalhe.iniciadoEm,
    motivo: detalhe.motivo,
    nota: detalhe.nota,
    status: detalhe.status,
    curadoria: detalhe.curadoria,
    conversa: detalhe.conversa,
    ...(detalhe.custo ? { custo: detalhe.custo } : {})
  };
}

function catalogoDeAtendimentos() {
  return [...catalogoBase, ...extrasDoMes].map(detalheDe);
}

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

const formatadorDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const diaCivil = /^\d{4}-\d{2}-\d{2}$/;

function diaNoFuso(iso: string) {
  const parts = formatadorDia.formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function periodoDaQuery(query: Record<string, string | undefined>) {
  const inicio = query.inicio;
  const fim = query.fim;

  if (
    inicio &&
    fim &&
    diaCivil.test(inicio) &&
    diaCivil.test(fim) &&
    inicio <= fim
  ) {
    return { inicio, fim };
  }

  return periodoMesCivil(new Date());
}

function passaNoRecorteEPeriodo(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>,
  quando: string
) {
  const periodo = periodoDaQuery(query);
  const dia = diaNoFuso(quando);

  if (dia < periodo.inicio || dia > periodo.fim) {
    return false;
  }

  if (recorte.administradora && item.administradora !== recorte.administradora) {
    return false;
  }

  if (recorte.agente && item.agenteId !== recorte.agente) {
    return false;
  }

  return true;
}

function passaNosFiltros(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>,
  modo: ModoDaListagem,
  perfilId: string
) {
  if (modo === 'monitoramento') {
    if (recorte.administradora && item.administradora !== recorte.administradora) {
      return false;
    }

    if (recorte.agente && item.agenteId !== recorte.agente) {
      return false;
    }

    return item.status === 'Em andamento';
  }

  const quando = modo === 'fila' ? (item.concluidoEm ?? item.iniciadoEm) : item.iniciadoEm;

  if (!passaNoRecorteEPeriodo(item, recorte, query, quando)) {
    return false;
  }

  if (query.status && item.status !== query.status) {
    return false;
  }

  if (query.nota && item.nota !== Number(query.nota)) {
    return false;
  }

  if (query.motivo && item.motivo !== query.motivo) {
    return false;
  }

  if (query.conversa && item.conversa !== query.conversa) {
    return false;
  }

  if (query.curadoria === 'true' && !item.curadoria) {
    return false;
  }

  if (query.curadoria === 'false' && item.curadoria) {
    return false;
  }

  if (modo === 'fila') {
    return (
      item.status === 'Concluído' &&
      Boolean(item.avaliacaoDaIa) &&
      !item.curadoria
    );
  }

  if (modo === 'minhas') {
    return item.curadoria && item.curadorId === perfilId;
  }

  if (modo === 'realizadas') {
    return item.curadoria;
  }

  return true;
}

function passaNoDashboard(
  item: RegistroDeAtendimento,
  recorte: ReturnType<typeof lerRecorte>,
  query: Record<string, string | undefined>
) {
  return passaNoRecorteEPeriodo(item, recorte, query, item.iniciadoEm);
}

function kpisDoPeriodo(itens: RegistroDeAtendimento[]) {
  const atendimentos = itens.length;
  const notaMedia =
    atendimentos === 0
      ? null
      : itens.reduce((soma, item) => soma + item.nota, 0) / atendimentos;
  const aprovados = itens.filter(
    (item) => item.nota >= reguaUnica.limiarDeAprovacao
  ).length;
  const aprovacao =
    atendimentos === 0 ? null : (aprovados / atendimentos) * 100;

  return [
    { id: 'atendimentos' as const, rotulo: 'Atendimentos', valor: atendimentos },
    { id: 'notaMedia' as const, rotulo: 'Nota média', valor: notaMedia },
    { id: 'aprovacao' as const, rotulo: 'Aprovação', valor: aprovacao }
  ];
}

function ordenarFila(itens: RegistroDeAtendimento[]) {
  return [...itens].sort((a, b) => {
    const quandoA = a.concluidoEm ?? a.iniciadoEm;
    const quandoB = b.concluidoEm ?? b.iniciadoEm;
    const porConclusao = quandoA.localeCompare(quandoB);

    return porConclusao !== 0 ? porConclusao : a.id.localeCompare(b.id, 'en');
  });
}

function responderMonitoramento(item: RegistroDeAtendimento): MonitoramentoDetalhe {
  return monitoramentoDetalheSchema.parse({
    id: item.id,
    administradora: item.administradora,
    agente: item.agente,
    agenteId: item.agenteId,
    iniciadoEm: item.iniciadoEm,
    motivo: item.motivo,
    status: item.status,
    conversa: item.conversa,
    transcricao: item.transcricao
  });
}

function responderDetalhe(item: RegistroDeAtendimento, papel: Papel) {
  const { custo, downloadDeAudio, curadorId: _curadorId, concluidoEm: _concluidoEm, ...resto } =
    item;

  return atendimentoDetalheSchema.parse({
    ...resto,
    ...(custoVisivelPara(papel) ? { custo } : {}),
    ...(downloadVisivelPara(papel) ? { downloadDeAudio } : {})
  });
}

const atendimentoRoutes: FastifyPluginAsync = async (app) => {
  const atendimentos = catalogoDeAtendimentos();

  async function listar(
    request: FastifyRequest,
    reply: FastifyReply,
    modo: ModoDaListagem
  ) {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (modo === 'minhas' && registro.papel !== 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    if (modo === 'realizadas' && registro.papel === 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const query = request.query as Record<string, string | undefined>;
    let recorte;

    try {
      recorte = lerRecorte({
        administradora: query.administradora,
        agente: query.agente
      });
    } catch {
      return reply.code(400).send({ statusCode: 400 });
    }

    const filtrados = atendimentos.filter((item) =>
      passaNosFiltros(item, recorte, query, modo, registro.id)
    );
    const itens = modo === 'fila' ? ordenarFila(filtrados) : filtrados;
    const tamanho = 50;
    const total = itens.length;
    const ultimaPagina = Math.max(1, Math.ceil(total / tamanho));
    const pagina = Math.min(
      ultimaPagina,
      Math.max(1, Number.parseInt(query.pagina ?? '1', 10) || 1)
    );
    const paginaItens = itens
      .slice((pagina - 1) * tamanho, pagina * tamanho)
      .map((item) => {
        const listagem = itemDaListagem(item);

        if (custoVisivelPara(registro.papel)) {
          return listagem;
        }

        const { custo: _custo, ...semCusto } = listagem;
        return semCusto;
      });

    return listagemResponseSchema.parse({
      recorte,
      pagina,
      tamanho,
      total,
      itens: paginaItens
    });
  }

  app.get('/dashboard', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel === 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const query = request.query as Record<string, string | undefined>;
    let recorte;

    try {
      recorte = lerRecorte({
        administradora: query.administradora,
        agente: query.agente
      });
    } catch {
      return reply.code(400).send({ statusCode: 400 });
    }

    const filtrados = atendimentos.filter((item) =>
      passaNoDashboard(item, recorte, query)
    );

    return dashboardResponseSchema.parse({
      recorte,
      periodo: periodoDaQuery(query),
      kpis: kpisDoPeriodo(filtrados)
    });
  });

  app.get('/atendimentos', (request, reply) => listar(request, reply, 'todos'));
  app.get('/monitoramento', (request, reply) => listar(request, reply, 'monitoramento'));
  app.get('/fila-de-curadoria', (request, reply) => listar(request, reply, 'fila'));
  app.get('/minhas-curadorias', (request, reply) => listar(request, reply, 'minhas'));
  app.get('/curadorias-realizadas', (request, reply) =>
    listar(request, reply, 'realizadas')
  );

  app.get('/manutencao', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel !== 'Admin') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const query = request.query as Record<string, string | undefined>;
    let recorte;

    try {
      recorte = lerRecorte({
        administradora: query.administradora,
        agente: query.agente
      });
    } catch {
      return reply.code(400).send({ statusCode: 400 });
    }

    const periodo = periodoDaQuery(query);
    const itens = atendimentos
      .map(itemDaFilaDeManutencao)
      .filter((item) => item !== null)
      .filter((item) => {
        if (recorte.administradora && item.administradora !== recorte.administradora) {
          return false;
        }

        if (recorte.agente && item.agenteId !== recorte.agente) {
          return false;
        }

        if (query.status && item.status !== query.status) {
          return false;
        }

        const dia = diaNoFuso(item.data);
        return dia >= periodo.inicio && dia <= periodo.fim;
      });
    const tamanho = 50;
    const total = itens.length;
    const ultimaPagina = Math.max(1, Math.ceil(total / tamanho));
    const pagina = Math.min(
      ultimaPagina,
      Math.max(1, Number.parseInt(query.pagina ?? '1', 10) || 1)
    );

    return filaDeManutencaoResponseSchema.parse({
      recorte,
      pagina,
      tamanho,
      total,
      itens: itens.slice((pagina - 1) * tamanho, pagina * tamanho)
    });
  });

  app.get('/monitoramento/:id', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const { id } = request.params as { id: string };
    const encontrado = atendimentos.find((item) => item.id === id);

    if (!encontrado || encontrado.status !== 'Em andamento') {
      return reply.code(404).send({ statusCode: 404 });
    }

    return responderMonitoramento(encontrado);
  });

  app.get('/atendimentos/:id', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const { id } = request.params as { id: string };
    const encontrado = atendimentos.find((item) => item.id === id);

    if (!encontrado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return responderDetalhe(encontrado, perfil.papel);
  });

  app.post('/atendimentos/:id/conferencia', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel !== 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const lido = conferenciaRequestSchema.safeParse(request.body);

    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = request.params as { id: string };
    const encontrado = atendimentos.find((item) => item.id === id);

    if (!encontrado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (
      encontrado.status !== 'Concluído' ||
      encontrado.curadoria ||
      !encontrado.avaliacaoDaIa
    ) {
      return reply.code(409).send({ statusCode: 409 });
    }

    encontrado.curadoria = true;
    encontrado.curadorId = registro.id;
    encontrado.avaliacaoDoCurador = {
      nota: lido.data.notaDaRegua,
      aprovacao:
        lido.data.notaDaRegua >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado',
      criterios: lido.data.checklist,
      notaDaAvaliacaoDaIa: encontrado.avaliacaoDaIa.nota,
      ...(lido.data.comentario ? { comentario: lido.data.comentario } : {})
    };

    if (lido.data.comentario) {
      encontrado.comentarioStatus = 'Pendente';
    }

    return responderDetalhe(encontrado, registro.papel);
  });

  app.post('/manutencao/:id/resolver', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel !== 'Admin') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const { id } = request.params as { id: string };
    const encontrado = atendimentos.find((item) => item.id === id);
    const comentario = encontrado ? itemDaFilaDeManutencao(encontrado) : null;

    if (!encontrado || !comentario) {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (comentario.status !== 'Pendente') {
      return reply.code(409).send({ statusCode: 409 });
    }

    encontrado.comentarioStatus = 'Resolvido';
    const atualizado = itemDaFilaDeManutencao(encontrado);

    if (!atualizado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return comentarioDaFilaSchema.parse(atualizado);
  });
};

export default atendimentoRoutes;
