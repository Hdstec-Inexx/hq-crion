import {
  monitoramentoDetalheSchema,
  monitoramentoListagemResponseSchema
} from '@hq-crion/contracts/atendimento';
import type { Recorte } from '@hq-crion/contracts/recorte';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { passaNoRecorte, recorteDaQuery } from '../atendimentos/filtros.js';
import { paginaDaLista } from '../atendimentos/pagina.js';
import { perfilDaAutorizacao, registroDaAutorizacao } from '../perfil/sessoes.js';
import {
  conversaAbertaNaFonte,
  buscarConversaElevenLabs,
  leituraAoVivoDaFonte,
  listarConversasElevenLabs,
  type LeituraAoVivo
} from '../ingestao/elevenlabs.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function itemDoMonitoramento(item: LeituraAoVivo) {
  return {
    id: item.id,
    administradora: item.administradora,
    agente: item.agente,
    agenteId: item.agenteId,
    iniciadoEm: item.iniciadoEm,
    motivo: item.motivo,
    status: 'Em andamento' as const
  };
}

function passaNoRecorteAoVivo(item: LeituraAoVivo, recorte: Recorte) {
  if (!recorte.administradora && !recorte.agente) {
    return true;
  }

  if (!item.administradora) {
    return false;
  }

  return passaNoRecorte(
    { administradora: item.administradora, agenteId: item.agenteId },
    recorte
  );
}

function listaVazia(recorte: Recorte, fonteConfigurada: boolean) {
  const pagina = paginaDaLista(0, undefined);

  return monitoramentoListagemResponseSchema.parse({
    recorte,
    pagina: pagina.pagina,
    tamanho: pagina.tamanho,
    total: 0,
    itens: [],
    fonteConfigurada
  });
}

const monitoramentoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/monitoramento', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const query = request.query as Record<string, string | undefined>;
    const recorte = recorteDaQuery(query);

    if (!recorte) {
      return reply.code(400).send({ statusCode: 400 });
    }

    if (!app.config.ELEVENLABS_API_KEY) {
      return listaVazia(recorte, false);
    }

    let fonte;

    try {
      fonte = await listarConversasElevenLabs({
        apiKey: app.config.ELEVENLABS_API_KEY,
        baseUrl: app.config.ELEVENLABS_BASE_URL,
        maxPaginas: 5
      });
    } catch {
      return reply.code(502).send({ statusCode: 502 });
    }

    const candidatos: LeituraAoVivo[] = [];

    for (const payload of fonte) {
      if (!conversaAbertaNaFonte(payload.status)) {
        continue;
      }

      const atendimento = leituraAoVivoDaFonte(payload);

      if (!atendimento || !passaNoRecorteAoVivo(atendimento, recorte)) {
        continue;
      }

      candidatos.push(atendimento);
    }

    const concluidos = await app.atendimentos.idsConcluidos(
      candidatos.map((item) => item.id)
    );
    const abertos = candidatos
      .filter((item) => !concluidos.has(item.id))
      .map(itemDoMonitoramento);
    const pagina = paginaDaLista(abertos.length, undefined);

    return monitoramentoListagemResponseSchema.parse({
      recorte,
      pagina: pagina.pagina,
      tamanho: pagina.tamanho,
      total: pagina.total,
      itens: abertos.slice(pagina.inicio, pagina.fim),
      fonteConfigurada: true
    });
  });

  app.get('/monitoramento/:id', async (request, reply) => {
    semCache(reply);
    const perfil = perfilDaAutorizacao(request.headers.authorization);

    if (!perfil) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const { id } = request.params as { id: string };

    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      return reply.code(404).send({ statusCode: 404 });
    }

    const noHq = await app.atendimentos.buscarPorId(id);

    if (!app.config.ELEVENLABS_API_KEY || noHq?.status === 'Concluído') {
      return reply.code(404).send({ statusCode: 404 });
    }

    let payload;

    try {
      payload = await buscarConversaElevenLabs({
        apiKey: app.config.ELEVENLABS_API_KEY,
        baseUrl: app.config.ELEVENLABS_BASE_URL,
        id
      });
    } catch {
      return reply.code(502).send({ statusCode: 502 });
    }

    const atendimento = payload ? leituraAoVivoDaFonte(payload) : undefined;

    if (!payload || !atendimento || !conversaAbertaNaFonte(payload.status)) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return monitoramentoDetalheSchema.parse({
      ...itemDoMonitoramento(atendimento),
      transcricao: atendimento.transcricao
    });
  });
};

export default monitoramentoRoutes;
