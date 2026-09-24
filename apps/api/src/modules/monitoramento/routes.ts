import {
  monitoramentoDetalheSchema,
  monitoramentoListagemResponseSchema,
  type MonitoramentoDetalhe
} from '@hq-crion/contracts/atendimento';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { perfilDaAutorizacao, registroDaAutorizacao } from '../perfil/sessoes.js';
import { passaNoRecorte, recorteDaQuery } from '../atendimentos/filtros.js';
import { paginaDaLista } from '../atendimentos/pagina.js';
import {
  atendimentoDaFonteElevenLabs,
  buscarConversaElevenLabs,
  conversaAbertaNaFonte,
  listarConversasElevenLabs
} from '../ingestao/elevenlabs.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function itemDoMonitoramento(item: {
  id: string;
  administradora: MonitoramentoDetalhe['administradora'];
  agente: string;
  agenteId: string;
  iniciadoEm: string;
  motivo: string;
}) {
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

    let fonte;

    try {
      fonte = app.config.ELEVENLABS_API_KEY
        ? await listarConversasElevenLabs({
            apiKey: app.config.ELEVENLABS_API_KEY,
            baseUrl: app.config.ELEVENLABS_BASE_URL
          })
        : [];
    } catch {
      return reply.code(502).send({ statusCode: 502 });
    }

    const candidatos = [];

    for (const payload of fonte) {
      if (!conversaAbertaNaFonte(payload.status)) {
        continue;
      }

      const atendimento = atendimentoDaFonteElevenLabs(payload);

      if (!atendimento || !passaNoRecorte(atendimento, recorte)) {
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
    const pagina = paginaDaLista(abertos.length, query.pagina);

    return monitoramentoListagemResponseSchema.parse({
      recorte,
      pagina: pagina.pagina,
      tamanho: pagina.tamanho,
      total: pagina.total,
      itens: abertos.slice(pagina.inicio, pagina.fim)
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

    const payload = await buscarConversaElevenLabs({
      apiKey: app.config.ELEVENLABS_API_KEY,
      baseUrl: app.config.ELEVENLABS_BASE_URL,
      id
    });
    const atendimento = payload ? atendimentoDaFonteElevenLabs(payload) : undefined;

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
