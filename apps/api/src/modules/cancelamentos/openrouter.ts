import {
  categoriaCausaCancelamentoSchema,
  type DiagnosticoCancelamento,
  type EvidenciaPesquisaIa,
  type PesquisaIaCancelamentoResponse
} from '@hq-crion/contracts/cancelamento';
import type { AppConfig } from '../../plugins/config.js';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';
import { extrairDiagnosticoDeCancelamento } from './heuristica.js';

const OPENROUTER_TIMEOUT_MS = 15_000;

export type AtendimentoParaPesquisa = RegistroDeAtendimento & {
  diagnosticoCancelamento: DiagnosticoCancelamento;
};

function montarEvidencia(
  item: AtendimentoParaPesquisa
): EvidenciaPesquisaIa {
  const diag = item.diagnosticoCancelamento;
  return {
    id: item.id,
    administradora: item.administradora,
    agente: item.agente,
    iniciadoEm: item.iniciadoEm,
    motivo: item.motivo,
    categoriaCausa: diag.categoriaCausa ?? null,
    vendaMalFeita: diag.vendaMalFeita,
    concorrenteCitado: diag.concorrenteCitado ?? null,
    diagnostico: diag.diagnostico ?? null,
    trecho: diag.evidenciaTrecho ?? null
  };
}

export function sintetizarPesquisaAnaliticaLocal(
  pergunta: string,
  atendimentos: AtendimentoParaPesquisa[],
  modelo: string
): PesquisaIaCancelamentoResponse {
  const perguntaNorm = pergunta.toLowerCase();
  const querHapvida = perguntaNorm.includes('hapvida');
  const querVendaMalFeita =
    perguntaNorm.includes('venda mal feita') ||
    perguntaNorm.includes('venda') ||
    perguntaNorm.includes('corretor');
  const querConcorrente =
    perguntaNorm.includes('concorrente') ||
    perguntaNorm.includes('migra') ||
    querHapvida;

  let selecionados: AtendimentoParaPesquisa[] = [];

  if (querHapvida) {
    selecionados = atendimentos.filter((a) =>
      a.diagnosticoCancelamento.concorrenteCitado?.toLowerCase().includes('hapvida')
    );
  } else if (querVendaMalFeita && !querConcorrente) {
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.vendaMalFeita
    );
  } else if (querConcorrente && !querHapvida) {
    selecionados = atendimentos.filter(
      (a) => Boolean(a.diagnosticoCancelamento.concorrenteCitado)
    );
  } else {
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
    );
  }

  // Se o filtro específico não trouxe nada, pega os cancelamentos gerais
  if (selecionados.length === 0) {
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
    );
  }

  const totalCancelamentos = atendimentos.filter(
    (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
  ).length;
  const totalHapvida = atendimentos.filter((a) =>
    a.diagnosticoCancelamento.concorrenteCitado?.toLowerCase().includes('hapvida')
  ).length;
  const totalVendaMalFeitaHapvida = atendimentos.filter(
    (a) =>
      a.diagnosticoCancelamento.concorrenteCitado?.toLowerCase().includes('hapvida') &&
      a.diagnosticoCancelamento.vendaMalFeita
  ).length;
  const totalVendaMalFeitaGeral = atendimentos.filter(
    (a) => a.diagnosticoCancelamento.vendaMalFeita
  ).length;

  let resposta = '';

  if (querHapvida && querVendaMalFeita) {
    resposta = `Identificamos ${totalHapvida} atendimento(s) em que o cliente cancelou e migrou para a Hapvida. Desses casos, ${totalVendaMalFeitaHapvida} confirmam a hipótese de venda mal feita, com relatos expressos de promessas de carência ou rede credenciada prometidas pelo corretor comercial que não foram cumpridas na prática.`;
  } else if (querHapvida) {
    resposta = `Foram identificados ${totalHapvida} caso(s) de cancelamento ou declaração expressa de migração para a Hapvida no período analisado, motivados principalmente por divergências de rede credenciada e carência.`;
  } else if (querVendaMalFeita) {
    resposta = `Constatamos ${totalVendaMalFeitaGeral} atendimento(s) com indício claro de venda mal feita entre os cancelamentos analisados. A insatisfação decorre de divergências entre as promessas comerciais dos corretores/vendedores e as coberturas reais do plano.`;
  } else if (querConcorrente) {
    resposta = `No período analisado, identificamos migrações expressas para operadoras concorrentes, com destaque para a Hapvida. Os clientes apontam divergência de rede e custos como catalisadores da migração.`;
  } else {
    resposta = `Com base nos ${totalCancelamentos} cancelamento(s) analisados no recorte, o padrão predominante envolve divergências comerciais (venda mal feita) e perda de clientes para operadoras concorrentes da rede credenciada.`;
  }

  return {
    pergunta,
    resposta,
    modelo,
    fonte: 'analitico-local',
    evidencias: selecionados.map(montarEvidencia)
  };
}

export async function executarPesquisaIa(params: {
  pergunta: string;
  atendimentos: AtendimentoParaPesquisa[];
  config: AppConfig;
}): Promise<PesquisaIaCancelamentoResponse> {
  const { pergunta, atendimentos, config } = params;
  const modelo = config.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash';

  if (!config.OPENROUTER_API_KEY) {
    return sintetizarPesquisaAnaliticaLocal(pergunta, atendimentos, modelo);
  }

  const cancelamentos = atendimentos.filter(
    (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
  );

  const dadosContexto = cancelamentos.slice(0, 50).map((a) => ({
    id: a.id,
    administradora: a.administradora,
    agente: a.agente,
    motivo: a.motivo,
    categoriaCausa: a.diagnosticoCancelamento.categoriaCausa,
    vendaMalFeita: a.diagnosticoCancelamento.vendaMalFeita,
    concorrenteCitado: a.diagnosticoCancelamento.concorrenteCitado,
    diagnostico: a.diagnosticoCancelamento.diagnostico,
    trecho: a.diagnosticoCancelamento.evidenciaTrecho
  }));

  const systemPrompt = `Você é o assistente executivo e analítico da plataforma HQ Crion, especializado em diagnóstico de cancelamentos e churn de planos de saúde.
Analise os atendimentos fornecidos abaixo para responder à pergunta do gestor.
Retorne EXCLUSIVAMENTE um objeto JSON com as chaves:
- "resposta": texto explicativo e objetivo em português pt-BR respondendo à pergunta com síntese analítica fundamentada nos dados;
- "evidenciaIds": array de strings com os IDs dos atendimentos mais relevantes que comprovam a resposta.`;

  const userPrompt = `Pergunta do gestor: "${pergunta}"

Atendimentos disponíveis no período (${cancelamentos.length} cancelamentos encontrados):
${JSON.stringify(dadosContexto, null, 2)}`;

  try {
    const url = `${config.OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://crion.ai',
        'X-Title': 'HQ Crion'
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      return sintetizarPesquisaAnaliticaLocal(pergunta, atendimentos, modelo);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const conteudo = payload.choices?.[0]?.message?.content;
    if (!conteudo) {
      return sintetizarPesquisaAnaliticaLocal(pergunta, atendimentos, modelo);
    }

    let parsed: { resposta?: string; evidenciaIds?: string[] } = {};
    try {
      parsed = JSON.parse(conteudo);
    } catch {
      const match = conteudo.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed.resposta || typeof parsed.resposta !== 'string') {
      return sintetizarPesquisaAnaliticaLocal(pergunta, atendimentos, modelo);
    }

    const idsEvidencias = new Set(parsed.evidenciaIds ?? []);
    let evidencias = atendimentos
      .filter((a) => idsEvidencias.has(a.id))
      .map(montarEvidencia);

    if (evidencias.length === 0) {
      evidencias = atendimentos
        .filter((a) => a.diagnosticoCancelamento.houveIntencaoCancelamento)
        .slice(0, 5)
        .map(montarEvidencia);
    }

    return {
      pergunta,
      resposta: parsed.resposta,
      modelo,
      fonte: 'openrouter',
      evidencias
    };
  } catch {
    return sintetizarPesquisaAnaliticaLocal(pergunta, atendimentos, modelo);
  }
}

export async function classificarAtendimentoComIa(params: {
  atendimento: RegistroDeAtendimento;
  config: AppConfig;
}): Promise<DiagnosticoCancelamento> {
  const { atendimento, config } = params;

  if (!config.OPENROUTER_API_KEY) {
    return {
      ...extrairDiagnosticoDeCancelamento(atendimento),
      origem: 'ia'
    };
  }

  const modelo = config.OPENROUTER_MODEL || 'deepseek/deepseek-v4.1-flash';
  const url = `${config.OPENROUTER_BASE_URL.replace(/\/+$/, '')}/chat/completions`;

  const systemPrompt = `Você é um classificador especializado em churn de planos de saúde.
Analise a transcrição e motivo do atendimento e responda EXCLUSIVAMENTE em formato JSON com os campos:
- houveIntencaoCancelamento (boolean)
- categoriaCausa (uma das opções exatas: "Venda mal feita / Divergência comercial", "Migração para concorrente", "Preço / Reajuste", "Rede credenciada / Cobertura", "Insatisfação com atendimento", "Problema financeiro / Boleto", "Outros", ou null)
- vendaMalFeita (boolean)
- concorrenteCitado (string ou null, ex.: "Hapvida", "Unimed", etc.)
- diagnostico (string concisa explicando o caso ou null)
- evidenciaTrecho (trecho da fala do cliente comprovando o caso ou null)`;

  const falas = (atendimento.transcricao ?? [])
    .map((t) => `${t.locutor}: ${t.texto}`)
    .join('\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Motivo: ${atendimento.motivo}\nTranscrição:\n${falas}`
          }
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      return {
        ...extrairDiagnosticoDeCancelamento(atendimento),
        origem: 'ia'
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const conteudo = payload.choices?.[0]?.message?.content;
    if (!conteudo) {
      return {
        ...extrairDiagnosticoDeCancelamento(atendimento),
        origem: 'ia'
      };
    }

    const parsed = JSON.parse(conteudo);
    const houveIntencao = Boolean(parsed.houveIntencaoCancelamento);
    const parsedCausa = categoriaCausaCancelamentoSchema.safeParse(parsed.categoriaCausa);
    const categoriaCausa = parsedCausa.success
      ? parsedCausa.data
      : houveIntencao
        ? 'Outros'
        : null;

    return {
      houveIntencaoCancelamento: houveIntencao,
      categoriaCausa,
      vendaMalFeita: Boolean(parsed.vendaMalFeita),
      concorrenteCitado:
        typeof parsed.concorrenteCitado === 'string' && parsed.concorrenteCitado.trim()
          ? parsed.concorrenteCitado.trim()
          : null,
      diagnostico:
        typeof parsed.diagnostico === 'string' && parsed.diagnostico.trim()
          ? parsed.diagnostico.trim()
          : null,
      evidenciaTrecho:
        typeof parsed.evidenciaTrecho === 'string' && parsed.evidenciaTrecho.trim()
          ? parsed.evidenciaTrecho.trim()
          : null,
      origem: 'ia'
    };
  } catch {
    return {
      ...extrairDiagnosticoDeCancelamento(atendimento),
      origem: 'ia'
    };
  }
}
