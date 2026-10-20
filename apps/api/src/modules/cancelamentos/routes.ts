import {
  categoriasDeCausaCancelamento,
  painelDeCancelamentosResponseSchema,
  pesquisaIaCancelamentoRequestSchema,
  pesquisaIaCancelamentoResponseSchema,
  analisarPassivoRequestSchema,
  analisarPassivoResponseSchema,
  filtrosCancelamentoQuerySchema,
  type CancelamentoItem,
  type CancelamentoPorCausa,
  type CancelamentoPorConcorrente,
  type CategoriaCausaCancelamento
} from '@hq-crion/contracts/cancelamento';
import type { Recorte } from '@hq-crion/contracts/recorte';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { registroDaAutorizacao } from '../perfil/sessoes.js';
import { periodoDaQuery, recorteDaQuery } from '../atendimentos/filtros.js';
import { itemDaListagem } from '../atendimentos/routes.js';
import { extrairDiagnosticoDeCancelamento } from './heuristica.js';
import {
  executarPesquisaIa,
  classificarAtendimentoComIa,
  type AtendimentoParaPesquisa
} from './openrouter.js';

function semCache(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function resolverRecorteEPeriodo(
  dados: {
    administradora?: string | null;
    agente?: string | null;
    inicio?: string | null;
    fim?: string | null;
  },
  query: Record<string, string | undefined>
):
  | { ok: true; recorte: Recorte; periodo: { inicio: string; fim: string } }
  | { ok: false; erro: 'recorte' | 'periodo' } {
  const queryMesclada: Record<string, string | undefined> = {
    ...query,
    ...(dados.administradora !== undefined ? { administradora: dados.administradora ?? undefined } : {}),
    ...(dados.agente !== undefined ? { agente: dados.agente ?? undefined } : {}),
    ...(dados.inicio !== undefined ? { inicio: dados.inicio ?? undefined } : {}),
    ...(dados.fim !== undefined ? { fim: dados.fim ?? undefined } : {})
  };

  const recorte = recorteDaQuery(queryMesclada);
  if (!recorte) {
    return { ok: false, erro: 'recorte' };
  }

  const periodo = periodoDaQuery(queryMesclada, 'dashboard');
  if (!periodo) {
    return { ok: false, erro: 'periodo' };
  }

  return { ok: true, recorte, periodo };
}

const cancelamentosRoutes: FastifyPluginAsync = async (app) => {
  // Handler do Painel de Cancelamentos
  const painelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel === 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const query = request.query as Record<string, string | undefined>;
    const recorte = recorteDaQuery(query);
    const periodo = periodoDaQuery(query, 'dashboard');

    if (!recorte || !periodo) {
      return reply.code(400).send({
        statusCode: 400,
        ...(recorte && !periodo ? { erro: 'periodo' } : {})
      });
    }

    const filtrosQuery = filtrosCancelamentoQuerySchema.safeParse(query);
    const filtros = filtrosQuery.success ? filtrosQuery.data : {};

    // Consulta atendimentos concluídos no recorte e período
    const itensBase = await app.atendimentos.consultarListagem(
      recorte,
      { inicio: periodo.inicio, fim: periodo.fim },
      'todos',
      registro.id,
      registro.papel
    );

    const concluidos = itensBase.filter((item) => item.status === 'Concluído');

    const atendimentosComDiag: AtendimentoParaPesquisa[] = concluidos.map((item) => ({
      ...item,
      diagnosticoCancelamento: extrairDiagnosticoDeCancelamento(item)
    }));

    const totalAtendimentos = atendimentosComDiag.length;
    const cancelamentos = atendimentosComDiag.filter(
      (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
    );
    const totalCancelamentos = cancelamentos.length;

    const percentualCancelamentos =
      totalAtendimentos > 0
        ? Number(((totalCancelamentos / totalAtendimentos) * 100).toFixed(1))
        : 0;

    const totalVendaMalFeita = cancelamentos.filter(
      (a) => a.diagnosticoCancelamento.vendaMalFeita
    ).length;

    const percentualVendaMalFeita =
      totalCancelamentos > 0
        ? Number(((totalVendaMalFeita / totalCancelamentos) * 100).toFixed(1))
        : 0;

    const comConcorrente = cancelamentos.filter((a) =>
      Boolean(a.diagnosticoCancelamento.concorrenteCitado)
    );
    const totalConcorrencia = comConcorrente.length;

    // Frequência de concorrentes para apontar o principal concorrente
    const contagemConcorrentes = new Map<string, number>();
    for (const c of comConcorrente) {
      const nome = c.diagnosticoCancelamento.concorrenteCitado!;
      contagemConcorrentes.set(nome, (contagemConcorrentes.get(nome) ?? 0) + 1);
    }

    let principalConcorrente: string | null = null;
    let maiorFrequencia = 0;
    for (const [nome, freq] of contagemConcorrentes.entries()) {
      if (freq > maiorFrequencia) {
        maiorFrequencia = freq;
        principalConcorrente = nome;
      }
    }

    const kpis = {
      totalAtendimentos,
      totalCancelamentos,
      percentualCancelamentos,
      totalVendaMalFeita,
      percentualVendaMalFeita,
      totalConcorrencia,
      principalConcorrente
    };

    // Agregação por Causa
    const contagemCausas = new Map<CategoriaCausaCancelamento, number>();
    for (const c of cancelamentos) {
      const causa = c.diagnosticoCancelamento.categoriaCausa ?? 'Outros';
      contagemCausas.set(causa, (contagemCausas.get(causa) ?? 0) + 1);
    }

    const porCausa: CancelamentoPorCausa[] = categoriasDeCausaCancelamento
      .map((causa) => {
        const quantidade = contagemCausas.get(causa) ?? 0;
        return {
          causa,
          quantidade,
          percentual:
            totalCancelamentos > 0
              ? Number(((quantidade / totalCancelamentos) * 100).toFixed(1))
              : 0
        };
      })
      .filter((item) => item.quantidade > 0)
      .sort((a, b) => b.quantidade - a.quantidade);

    // Agregação por Concorrente
    const gruposConcorrente = new Map<
      string,
      { quantidade: number; vendaMalFeitaCount: number }
    >();

    for (const c of comConcorrente) {
      const conc = c.diagnosticoCancelamento.concorrenteCitado!;
      const atual = gruposConcorrente.get(conc) ?? {
        quantidade: 0,
        vendaMalFeitaCount: 0
      };
      atual.quantidade += 1;
      if (c.diagnosticoCancelamento.vendaMalFeita) {
        atual.vendaMalFeitaCount += 1;
      }
      gruposConcorrente.set(conc, atual);
    }

    const porConcorrente: CancelamentoPorConcorrente[] = Array.from(
      gruposConcorrente.entries()
    )
      .map(([concorrente, dados]) => ({
        concorrente,
        quantidade: dados.quantidade,
        vendaMalFeitaCount: dados.vendaMalFeitaCount
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    // Filtragem dos Itens de Cancelamento
    let itensFiltrados = cancelamentos;

    if (filtros.causa) {
      itensFiltrados = itensFiltrados.filter(
        (i) => i.diagnosticoCancelamento.categoriaCausa === filtros.causa
      );
    }

    if (filtros.vendaMalFeita === 'sim') {
      itensFiltrados = itensFiltrados.filter(
        (i) => i.diagnosticoCancelamento.vendaMalFeita === true
      );
    } else if (filtros.vendaMalFeita === 'nao') {
      itensFiltrados = itensFiltrados.filter(
        (i) => !i.diagnosticoCancelamento.vendaMalFeita
      );
    }

    if (filtros.concorrente) {
      const concFiltro = filtros.concorrente.toLowerCase();
      itensFiltrados = itensFiltrados.filter((i) =>
        i.diagnosticoCancelamento.concorrenteCitado?.toLowerCase().includes(concFiltro)
      );
    }

    if (filtros.busca) {
      const termo = filtros.busca.toLowerCase();
      itensFiltrados = itensFiltrados.filter((i) => {
        const idMatch = i.id.toLowerCase().includes(termo);
        const convMatch = i.conversa.toLowerCase().includes(termo);
        const motMatch = i.motivo.toLowerCase().includes(termo);
        const diagMatch = i.diagnosticoCancelamento.diagnostico?.toLowerCase().includes(termo);
        const trechoMatch = i.diagnosticoCancelamento.evidenciaTrecho?.toLowerCase().includes(termo);
        const transMatch = i.transcricao.some((t) => t.texto.toLowerCase().includes(termo));
        return Boolean(idMatch || convMatch || motMatch || diagMatch || trechoMatch || transMatch);
      });
    }

    // Ordena do mais recente para o mais antigo
    itensFiltrados.sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm));

    const itens: CancelamentoItem[] = itensFiltrados.map((item) => ({
      ...itemDaListagem(item),
      diagnosticoCancelamento: item.diagnosticoCancelamento
    }));

    return painelDeCancelamentosResponseSchema.parse({
      recorte,
      periodo,
      kpis,
      porCausa,
      porConcorrente,
      itens
    });
  };

  app.get('/cancelamentos', painelHandler);
  app.get('/api/cancelamentos', painelHandler);

  // Handler de Pesquisa por IA
  const pesquisaIaHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel === 'Curador') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const lido = pesquisaIaCancelamentoRequestSchema.safeParse(request.body);
    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const query = request.query as Record<string, string | undefined>;
    const resolvido = resolverRecorteEPeriodo(lido.data, query);

    if (!resolvido.ok) {
      return reply.code(400).send({
        statusCode: 400,
        ...(resolvido.erro === 'periodo' ? { erro: 'periodo' } : {})
      });
    }

    const { recorte, periodo } = resolvido;

    const itensBase = await app.atendimentos.consultarListagem(
      recorte,
      { inicio: periodo.inicio, fim: periodo.fim },
      'todos',
      registro.id,
      registro.papel
    );

    const concluidos = itensBase.filter((item) => item.status === 'Concluído');

    const atendimentosComDiag: AtendimentoParaPesquisa[] = concluidos.map((item) => ({
      ...item,
      diagnosticoCancelamento: extrairDiagnosticoDeCancelamento(item)
    }));

    const resultado = await executarPesquisaIa({
      pergunta: lido.data.pergunta,
      atendimentos: atendimentosComDiag,
      config: app.config
    });

    return pesquisaIaCancelamentoResponseSchema.parse(resultado);
  };

  app.post('/cancelamentos/pesquisa-ia', pesquisaIaHandler);
  app.post('/api/cancelamentos/pesquisa-ia', pesquisaIaHandler);

  // Handler de Analisar Passivo
  const analisarPassivoHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    semCache(reply);
    const registro = registroDaAutorizacao(request.headers.authorization);

    if (!registro) {
      return reply.code(401).send({ statusCode: 401 });
    }

    if (registro.papel !== 'Admin') {
      return reply.code(403).send({ statusCode: 403 });
    }

    const lido = analisarPassivoRequestSchema.safeParse(request.body ?? {});
    if (!lido.success) {
      return reply.code(400).send({ statusCode: 400 });
    }

    const query = request.query as Record<string, string | undefined>;
    const resolvido = resolverRecorteEPeriodo(lido.data, query);

    if (!resolvido.ok) {
      return reply.code(400).send({
        statusCode: 400,
        ...(resolvido.erro === 'periodo' ? { erro: 'periodo' } : {})
      });
    }

    const { recorte, periodo } = resolvido;

    const itensBase = await app.atendimentos.consultarListagem(
      recorte,
      { inicio: periodo.inicio, fim: periodo.fim },
      'todos',
      registro.id,
      registro.papel
    );

    const limite = Math.min(lido.data.limite ?? 50, 200);
    const pendentesPassivo = itensBase
      .filter(
        (item) =>
          item.status === 'Concluído' &&
          Boolean(item.avaliacaoDaIa) &&
          item.avaliacaoDaIa?.diagnosticoCancelamento?.origem !== 'ia'
      )
      .slice(0, limite);

    let cancelamentosDetectados = 0;

    for (const item of pendentesPassivo) {
      const avaliacaoExistente = item.avaliacaoDaIa!;
      const diag = await classificarAtendimentoComIa({
        atendimento: item,
        config: app.config
      });

      if (diag.houveIntencaoCancelamento) {
        cancelamentosDetectados += 1;
      }

      const criterios = avaliacaoExistente.criterios.map((c) => ({
        chave: c.chave,
        nome: c.nome,
        estado: c.estado,
        pontos: c.pontos,
        critico: c.critico
      }));

      await app.atendimentos.gravarAvaliacaoDaIa(item.id, {
        nota: avaliacaoExistente.nota,
        criterios,
        resumo: avaliacaoExistente.resumo ?? null,
        falhasIdentificadas: avaliacaoExistente.falhasIdentificadas ?? [],
        diagnosticoCancelamento: diag
      });
    }

    const modelo = app.config.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash';
    const fonte = app.config.OPENROUTER_API_KEY ? 'openrouter' : 'analitico-local';

    return analisarPassivoResponseSchema.parse({
      analisados: pendentesPassivo.length,
      cancelamentosDetectados,
      modelo,
      fonte
    });
  };

  app.post('/cancelamentos/analisar-passivo', analisarPassivoHandler);
  app.post('/api/cancelamentos/analisar-passivo', analisarPassivoHandler);
};

export default cancelamentosRoutes;
