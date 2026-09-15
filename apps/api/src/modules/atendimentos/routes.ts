import {
  atendimentoDetalheSchema,
  custoVisivelPara,
  downloadVisivelPara,
  listagemResponseSchema,
  type AtendimentoDetalhe,
  type AtendimentoListItem,
  type Avaliacao,
  type EstadoDoCriterio
} from '@hq-crion/contracts/atendimento';
import { lerRecorte, periodoMesCivil } from '@hq-crion/contracts/recorte';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { perfilDaAutorizacao } from '../perfil/sessoes.js';
import { reguaUnica } from '../regua/regua-unica.js';

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

function avaliacaoDe(nota: number, conferida: boolean): Avaliacao {
  return {
    nota,
    aprovacao: nota >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado',
    criterios: criteriosDaAvaliacao(conferida)
  };
}

function detalheDe(item: AtendimentoListItem): AtendimentoDetalhe {
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
    ...(item.curadoria ? { avaliacaoDoCurador: avaliacaoDe(6, true) } : {})
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

const atendimentos = [...catalogoBase, ...extrasDoMes].map(detalheDe);

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

const atendimentoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/atendimentos', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
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
    const itens = atendimentos.filter((item) => {
      const dia = diaNoFuso(item.iniciadoEm);

      if (dia < periodo.inicio || dia > periodo.fim) {
        return false;
      }

      if (recorte.administradora && item.administradora !== recorte.administradora) {
        return false;
      }

      if (recorte.agente && item.agenteId !== recorte.agente) {
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

      return true;
    });
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

        if (custoVisivelPara(perfil.papel)) {
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

    const { custo, downloadDeAudio, ...resto } = encontrado;

    return atendimentoDetalheSchema.parse({
      ...resto,
      ...(custoVisivelPara(perfil.papel) ? { custo } : {}),
      ...(downloadVisivelPara(perfil.papel) ? { downloadDeAudio } : {})
    });
  });
};

export default atendimentoRoutes;
