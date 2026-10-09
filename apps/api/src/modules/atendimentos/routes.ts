import {
  atendimentoDetalheSchema,
  conferenciaRequestSchema,
  custoVisivelPara,
  downloadVisivelPara,
  filaDeManutencaoResponseSchema,
  percursoDaFilaDeManutencaoSchema,
  falhasIdentificadasDe,
  type EstadoDoCriterio,
  gravacaoDaAvaliacaoDaIaSchema,
  listagemResponseSchema,
  comentarioDaFilaSchema,
  type AtendimentoDetalhe,
  type AtendimentoListItem,
  type Avaliacao
} from '@hq-crion/contracts/atendimento';
import type { Papel } from '@hq-crion/contracts/perfil';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  buscarConversaElevenLabs,
  transcricaoPrecisaDeReleitura,
  transcricaoRelida
} from '../ingestao/elevenlabs.js';
import { perfilDaAutorizacao, registroDaAutorizacao } from '../perfil/sessoes.js';
import { buscarPorId } from '../perfil/repositorio.js';
import { periodoDaQuery, recorteDaQuery, type ModoDaListagem } from './filtros.js';
import { paginaDaLista } from './pagina.js';
import type { FavoritosDoAtendimento } from './porta.js';
import {
  aprovacaoDaAvaliacao,
  detalhePublico,
  montarConferencia,
  recusaDaConferencia,
  recusaNaoSeAplica,
  type RegistroDeAtendimento
} from './registro.js';

function itemDaFilaDeManutencao(item: RegistroDeAtendimento) {
  const texto = item.avaliacaoDoCurador?.comentario;

  if (!texto) {
    return null;
  }

  const resolvidoPor =
    item.comentarioResolvidoPorNome ??
    (item.comentarioResolvidoPorId
      ? buscarPorId(item.comentarioResolvidoPorId)?.nome
      : undefined);

  return {
    id: item.comentarioId ?? item.id,
    atendimentoId: item.id,
    administradora: item.administradora,
    agente: item.agente,
    agenteId: item.agenteId,
    conversa: item.conversa,
    data: item.iniciadoEm,
    texto,
    status: item.comentarioStatus ?? 'Pendente',
    ...(resolvidoPor ? { resolvidoPor } : {}),
    ...(item.comentarioResolvidoEm ? { resolvidoEm: item.comentarioResolvidoEm } : {})
  };
}

function curadoresDaListagem(itens: RegistroDeAtendimento[]) {
  const vistos = new Map<string, { id: string; nome: string }>();

  for (const item of itens) {
    if (!item.curadorDaRevisao || vistos.has(item.curadorDaRevisao.id)) {
      continue;
    }

    const perfil = buscarPorId(item.curadorDaRevisao.id);

    if (perfil?.papel === 'Curador') {
      vistos.set(item.curadorDaRevisao.id, {
        id: perfil.id,
        nome: item.curadorDaRevisao.nome
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
    ...(detalhe.custo ? { custo: detalhe.custo } : {}),
    favoritadoPeloUsuario: detalhe.favoritadoPeloUsuario ?? false,
    favoritosCount: detalhe.favoritosCount ?? 0,
    favoritosPerfis: detalhe.favoritosPerfis ?? []
  };
}

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function exigirPapel(
  request: FastifyRequest,
  reply: FastifyReply,
  papel: Papel
) {
  const registro = registroDaAutorizacao(request.headers.authorization);

  if (!registro) {
    void reply.code(401).send({ statusCode: 401 });
    return undefined;
  }

  if (registro.papel !== papel) {
    void reply.code(403).send({ statusCode: 403 });
    return undefined;
  }

  return registro;
}

function ordenarFila(itens: RegistroDeAtendimento[]) {
  return [...itens].sort((a, b) => {
    const quandoA = a.concluidoEm ?? a.iniciadoEm;
    const quandoB = b.concluidoEm ?? b.iniciadoEm;
    const porConclusao = quandoA.localeCompare(quandoB);

    return porConclusao !== 0 ? porConclusao : a.id.localeCompare(b.id, 'en');
  });
}

function corpoEnviaNota(body: unknown) {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const campos = body as Record<string, unknown>;
  return 'nota' in campos || 'notaDaRegua' in campos || 'notaDaAvaliacaoDaIa' in campos;
}

function comAprovacao<
  T extends { nota: number; criterios: { estado: EstadoDoCriterio; critico: boolean }[] }
>(avaliacao: T): T & Pick<Avaliacao, 'aprovacao'> {
  return {
    ...avaliacao,
    aprovacao: aprovacaoDaAvaliacao(avaliacao.nota, avaliacao.criterios)
  };
}

function responderDetalhe(
  item: RegistroDeAtendimento,
  papel: Papel,
  favoritosInfo?: FavoritosDoAtendimento
) {
  const { custo, downloadDeAudio, avaliacaoDaIa, avaliacaoDoCurador, ...resto } =
    detalhePublico(item);

  return atendimentoDetalheSchema.parse({
    ...resto,
    ...(avaliacaoDaIa ? { avaliacaoDaIa: comAprovacao(avaliacaoDaIa) } : {}),
    ...(avaliacaoDoCurador ? { avaliacaoDoCurador: comAprovacao(avaliacaoDoCurador) } : {}),
    ...(custoVisivelPara(papel) && custo ? { custo } : {}),
    ...(downloadVisivelPara(papel) && downloadDeAudio ? { downloadDeAudio } : {}),
    favoritadoPeloUsuario: favoritosInfo?.favoritadoPeloUsuario ?? false,
    favoritos: favoritosInfo?.favoritos ?? { count: 0, perfis: [] }
  });
}

export const conversasSemChamadaEstruturada = new Set<string>();

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

    if (!recorte || !periodoDaQuery(query)) {
      return reply.code(400).send({
        statusCode: 400,
        ...(recorte ? { erro: 'periodo' } : {})
      });
    }

    const comIndicador = await app.atendimentos.consultarListagem(
      recorte,
      query,
      modo,
      registro.id
    );
    const itens = modo === 'fila' ? ordenarFila(comIndicador) : comIndicador;
    const pagina = paginaDaLista(itens.length, query.pagina);

    return listagemResponseSchema.parse({
      recorte,
      pagina: pagina.pagina,
      tamanho: pagina.tamanho,
      total: pagina.total,
      itens: itens.slice(pagina.inicio, pagina.fim).map((item) => {
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
  app.get('/fila-de-curadoria', (request, reply) => listar(request, reply, 'fila'));
  app.get('/minhas-curadorias', (request, reply) => listar(request, reply, 'minhas'));
  app.get('/curadorias-realizadas', (request, reply) =>
    listar(request, reply, 'realizadas')
  );

  app.get('/manutencao', async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Admin');

    if (!registro) {
      return;
    }

    const query = request.query as Record<string, string | undefined>;
    const recorte = recorteDaQuery(query);

    if (!recorte || !periodoDaQuery(query)) {
      return reply.code(400).send({
        statusCode: 400,
        ...(recorte ? { erro: 'periodo' } : {})
      });
    }

    const itens = (await app.atendimentos.consultarManutencao(recorte, query))
      .map(itemDaFilaDeManutencao)
      .filter((item) => item !== null)
      .sort((a, b) => {
        const porData = a.data.localeCompare(b.data);
        return porData !== 0 ? porData : a.id.localeCompare(b.id, 'en');
      });
    const pagina = paginaDaLista(itens.length, query.pagina);

    return filaDeManutencaoResponseSchema.parse({
      recorte,
      pagina: pagina.pagina,
      tamanho: pagina.tamanho,
      total: pagina.total,
      itens: itens.slice(pagina.inicio, pagina.fim)
    });
  });

  app.get('/manutencao/proximo', async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Admin');

    if (!registro) {
      return;
    }

    const query = request.query as Record<string, string | undefined>;
    const atendimentoId =
      typeof query.atendimento === 'string' ? query.atendimento.trim() : '';
    const recorte = recorteDaQuery(query);

    if (!atendimentoId || atendimentoId.length > 200 || !recorte || !periodoDaQuery(query)) {
      return reply.code(400).send({
        statusCode: 400,
        ...(atendimentoId && atendimentoId.length <= 200 && recorte ? { erro: 'periodo' } : {})
      });
    }

    const percurso = await app.atendimentos.consultarPercursoDaManutencao(
      atendimentoId,
      recorte,
      query
    );

    if (percurso === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    return percursoDaFilaDeManutencaoSchema.parse(percurso);
  });

  app.get('/atendimentos/:id', async (request, reply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    const { id } = request.params as { id: string };
    const encontrado = await app.atendimentos.buscarPorId(id);

    if (!encontrado) {
      return reply.code(404).send({ statusCode: 404 });
    }

    const item = { ...encontrado };

    if (
      app.config.ELEVENLABS_API_KEY &&
      item.conversa &&
      !conversasSemChamadaEstruturada.has(item.conversa) &&
      transcricaoPrecisaDeReleitura(item.transcricao)
    ) {
      try {
        const payload = await buscarConversaElevenLabs({
          apiKey: app.config.ELEVENLABS_API_KEY,
          baseUrl: app.config.ELEVENLABS_BASE_URL,
          id: item.conversa,
          esperaMs: 5_000
        });
        const relida = payload ? transcricaoRelida(item.transcricao, payload) : item.transcricao;

        if (relida !== item.transcricao) {
          item.transcricao = [...relida];
          await app.atendimentos.gravarTranscricao(item.id, item.transcricao);
        } else {
          conversasSemChamadaEstruturada.add(item.conversa);
        }
      } catch {
        item.transcricao = encontrado.transcricao;
      }
    }

    if (app.descobrirMidia) {
      if (!item.audio || !/^https?:\/\//i.test(item.audio)) {
        const chaveBusca =
          (item.audio ? item.audio.replace(/^\/media\//, '') : '') ||
          item.conversa ||
          id;
        const descoberto =
          (await app.descobrirMidia(chaveBusca)) ??
          (chaveBusca !== id ? await app.descobrirMidia(id) : undefined);
        if (descoberto) {
          item.audio = descoberto;
          item.downloadDeAudio = descoberto;
        }
      }
    }

    const favoritos = await app.atendimentos.obterFavoritos(id, registro.id);
    return responderDetalhe(item, registro.papel, favoritos);
  });

  app.post('/atendimentos/:id/conferencia', { bodyLimit: 32_768 }, async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Curador');

    if (!registro) {
      return;
    }

    if (corpoEnviaNota(request.body)) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const lido = conferenciaRequestSchema.safeParse(request.body);

    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = request.params as { id: string };
    const atual = await app.atendimentos.buscarPorId(id);
    const recusa = recusaDaConferencia(atual);

    if (recusa === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    if (recusa === 'indisponivel' || !atual?.avaliacaoDaIa) {
      return reply.code(409).send({ statusCode: 409 });
    }

    const montada = montarConferencia(atual.avaliacaoDaIa.criterios, lido.data.checklist);

    if (!montada) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const resultado = await app.atendimentos.conferir(id, {
      curador: { id: registro.id, nome: registro.nome },
      nota: montada.nota,
      criterios: montada.criterios,
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

    const favoritos = await app.atendimentos.obterFavoritos(id, registro.id);
    return responderDetalhe(encontrado, registro.papel, favoritos);
  });

  app.post('/atendimentos/:id/avaliacao-da-ia', { bodyLimit: 32_768 }, async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Admin');

    if (!registro) {
      return;
    }

    const lido = gravacaoDaAvaliacaoDaIaSchema.safeParse(request.body);

    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    if (recusaNaoSeAplica(lido.data.criterios)) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const { id } = request.params as { id: string };
    const resultado = await app.atendimentos.gravarAvaliacaoDaIa(id, {
      ...lido.data,
      falhasIdentificadas: falhasIdentificadasDe(lido.data.falhasIdentificadas)
    });

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

    const favoritos = await app.atendimentos.obterFavoritos(id, registro.id);
    return responderDetalhe(encontrado, registro.papel, favoritos);
  });

  app.post('/atendimentos/:id/favorito', async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Curador');

    if (!registro) {
      return;
    }

    const { id } = request.params as { id: string };
    const resultado = await app.atendimentos.favoritar(id, registro.id);

    if (resultado === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    return reply.code(200).send({ favoritadoPeloUsuario: true });
  });

  app.delete('/atendimentos/:id/favorito', async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Curador');

    if (!registro) {
      return;
    }

    const { id } = request.params as { id: string };
    const resultado = await app.atendimentos.desfavoritar(id, registro.id);

    if (resultado === 'ausente') {
      return reply.code(404).send({ statusCode: 404 });
    }

    return reply.code(200).send({ favoritadoPeloUsuario: false });
  });

  app.post('/manutencao/:id/resolver', async (request, reply) => {
    semCache(reply);
    const registro = exigirPapel(request, reply, 'Admin');

    if (!registro) {
      return;
    }

    const { id } = request.params as { id: string };
    const resultado = await app.atendimentos.resolverComentario(id, registro.id);

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
