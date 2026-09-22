import {
  atendimentoDetalheSchema,
  conferenciaRequestSchema,
  custoVisivelPara,
  downloadVisivelPara,
  filaDeManutencaoResponseSchema,
  gravacaoDaAvaliacaoDaIaSchema,
  listagemResponseSchema,
  monitoramentoDetalheSchema,
  monitoramentoListagemResponseSchema,
  comentarioDaFilaSchema,
  type AtendimentoDetalhe,
  type AtendimentoListItem,
  type Avaliacao,
  type MonitoramentoDetalhe
} from '@hq-crion/contracts/atendimento';
import type { Papel } from '@hq-crion/contracts/perfil';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { perfilDaAutorizacao, registroDaAutorizacao } from '../perfil/sessoes.js';
import { buscarPorId } from '../perfil/repositorio.js';
import { recorteDaQuery, type ModoDaListagem } from './filtros.js';
import {
  aprovacaoDaNota,
  detalhePublico,
  type RegistroDeAtendimento
} from './registro.js';

function itemDaFilaDeManutencao(item: RegistroDeAtendimento) {
  const texto = item.avaliacaoDoCurador?.comentario;

  if (!texto) {
    return null;
  }

  return {
    id: item.comentarioId ?? item.id,
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

function curadoresDaListagem(itens: RegistroDeAtendimento[]) {
  const vistos = new Map<string, { id: string; nome: string }>();

  for (const item of itens) {
    if (!item.curadorId || vistos.has(item.curadorId)) {
      continue;
    }

    const perfil = buscarPorId(item.curadorId);

    if (perfil?.papel === 'Curador') {
      vistos.set(item.curadorId, {
        id: perfil.id,
        nome: item.curadorNome ?? perfil.nome
      });
    }
  }

  return [...vistos.values()];
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

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function ordenarFila(itens: RegistroDeAtendimento[]) {
  return [...itens].sort((a, b) => {
    const quandoA = a.concluidoEm ?? a.iniciadoEm;
    const quandoB = b.concluidoEm ?? b.iniciadoEm;
    const porConclusao = quandoA.localeCompare(quandoB);

    return porConclusao !== 0 ? porConclusao : a.id.localeCompare(b.id, 'en');
  });
}

function itemDoMonitoramento(item: RegistroDeAtendimento) {
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

function responderMonitoramento(item: RegistroDeAtendimento): MonitoramentoDetalhe {
  return monitoramentoDetalheSchema.parse({
    ...itemDoMonitoramento(item),
    transcricao: item.transcricao
  });
}

function comAprovacao<T extends { nota: number }>(avaliacao: T): T & Pick<Avaliacao, 'aprovacao'> {
  return {
    ...avaliacao,
    aprovacao: aprovacaoDaNota(avaliacao.nota)
  };
}

function responderDetalhe(item: RegistroDeAtendimento, papel: Papel) {
  const { custo, downloadDeAudio, avaliacaoDaIa, avaliacaoDoCurador, ...resto } =
    detalhePublico(item);

  return atendimentoDetalheSchema.parse({
    ...resto,
    ...(avaliacaoDaIa ? { avaliacaoDaIa: comAprovacao(avaliacaoDaIa) } : {}),
    ...(avaliacaoDoCurador ? { avaliacaoDoCurador: comAprovacao(avaliacaoDoCurador) } : {}),
    ...(custoVisivelPara(papel) && custo ? { custo } : {}),
    ...(downloadVisivelPara(papel) && downloadDeAudio ? { downloadDeAudio } : {})
  });
}

const atendimentoRoutes: FastifyPluginAsync = async (app) => {
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
    const recorte = recorteDaQuery(query);

    if (!recorte) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const comIndicador = await app.atendimentos.consultarListagem(
      recorte,
      query,
      modo,
      registro.id
    );
    const itens = modo === 'fila' ? ordenarFila(comIndicador) : comIndicador;
    const tamanho = 50;
    const total = itens.length;
    const ultimaPagina = Math.max(1, Math.ceil(total / tamanho));
    const pagina = Math.min(
      ultimaPagina,
      Math.max(1, Number.parseInt(query.pagina ?? '1', 10) || 1)
    );
    const paginaItens = itens.slice((pagina - 1) * tamanho, pagina * tamanho);

    if (modo === 'monitoramento') {
      return monitoramentoListagemResponseSchema.parse({
        recorte,
        pagina,
        tamanho,
        total,
        itens: paginaItens.map(itemDoMonitoramento)
      });
    }

    return listagemResponseSchema.parse({
      recorte,
      pagina,
      tamanho,
      total,
      itens: paginaItens.map((item) => {
        const listagem = itemDaListagem(item);

        if (custoVisivelPara(registro.papel)) {
          return listagem;
        }

        const { custo: _custo, ...semCusto } = listagem;
        return semCusto;
      }),
      curadores:
        modo === 'todos' || modo === 'realizadas' ? curadoresDaListagem(itens) : []
    });
  }

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
    const recorte = recorteDaQuery(query);

    if (!recorte) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const itens = (await app.atendimentos.consultarManutencao(recorte, query))
      .map(itemDaFilaDeManutencao)
      .filter((item) => item !== null);
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
    const encontrado = await app.atendimentos.buscarPorId(id);

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
    const encontrado = await app.atendimentos.buscarPorId(id);

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
    const resultado = await app.atendimentos.conferir(id, {
      curadorId: registro.id,
      curadorNome: registro.nome,
      nota: lido.data.notaDaRegua,
      criterios: lido.data.checklist,
      ...(lido.data.comentario ? { comentario: lido.data.comentario } : {})
    });

    if (resultado === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (resultado === 'indisponivel') {
      return reply.code(409).send({ statusCode: 409 });
    }

    const encontrado = await app.atendimentos.buscarPorId(id);

    if (!encontrado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return responderDetalhe(encontrado, registro.papel);
  });

  app.post('/atendimentos/:id/avaliacao-da-ia', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel !== 'Admin') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const lido = gravacaoDaAvaliacaoDaIaSchema.safeParse(request.body);

    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = request.params as { id: string };
    const resultado = await app.atendimentos.gravarAvaliacaoDaIa(id, lido.data);

    if (resultado === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (resultado === 'em-andamento') {
      return reply.code(409).send({ statusCode: 409 });
    }

    const encontrado = await app.atendimentos.buscarPorId(id);

    if (!encontrado) {
      return reply.code(404).send({ statusCode: 404 });
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
    const resultado = await app.atendimentos.resolverComentario(id);

    if (resultado === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (resultado === 'ja-resolvido') {
      return reply.code(409).send({ statusCode: 409 });
    }

    const atualizado = itemDaFilaDeManutencao(resultado);

    if (!atualizado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    return comentarioDaFilaSchema.parse(atualizado);
  });
};

export default atendimentoRoutes;
