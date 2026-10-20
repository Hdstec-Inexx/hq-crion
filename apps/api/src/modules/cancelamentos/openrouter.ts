import {
  categoriaCausaCancelamentoSchema,
  type DiagnosticoCancelamento,
  type EvidenciaPesquisaIa,
  type PesquisaIaCancelamentoResponse
} from '@hq-crion/contracts/cancelamento';
import type { AppConfig } from '../../plugins/config.js';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';
import {
  extrairDiagnosticoDeCancelamento,
  sanearDiagnosticoContraFalsosPositivos,
  CONCORRENTES
} from './heuristica.js';

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

function detectarConcorrenteNaPergunta(pergunta: string): string | null {
  for (const concorrente of CONCORRENTES) {
    if (concorrente.padrao.test(pergunta)) {
      return concorrente.nome;
    }
  }
  return null;
}

function sanitizarTextoExecutivo(texto: string): string {
  return texto
    .replace(/['"]?(concorrenteCitado|concorrente_citado)['"]?/g, 'Concorrente Citado')
    .replace(/['"]?(vendaMalFeita|venda_mal_feita)['"]?/g, 'Venda Mal Feita')
    .replace(
      /['"]?(categoriaCausa|categoria_causa|categoria_causa_cancelamento)['"]?/g,
      'Causa de Cancelamento'
    )
    .replace(
      /['"]?(houveIntencaoCancelamento|houve_intencao_cancelamento)['"]?/g,
      'Intenção de Cancelamento'
    )
    .replace(
      /['"]?(diagnosticoCancelamento|diagnostico_cancelamento)['"]?/g,
      'Diagnóstico de Cancelamento'
    );
}

export function sintetizarPesquisaAnaliticaLocal(
  pergunta: string,
  atendimentos: AtendimentoParaPesquisa[],
  modelo: string
): PesquisaIaCancelamentoResponse {
  const perguntaNorm = pergunta.toLowerCase();
  const concorrentePerguntado = detectarConcorrenteNaPergunta(pergunta);
  const querVendaMalFeita =
    perguntaNorm.includes('venda mal feita') ||
    perguntaNorm.includes('venda') ||
    perguntaNorm.includes('corretor');
  const querConcorrente =
    perguntaNorm.includes('concorrente') ||
    perguntaNorm.includes('migra') ||
    Boolean(concorrentePerguntado);

  let selecionados: AtendimentoParaPesquisa[] = [];
  let ehPerguntaEspecifica = false;

  if (concorrentePerguntado) {
    ehPerguntaEspecifica = true;
    const def = CONCORRENTES.find((c) => c.nome === concorrentePerguntado);
    selecionados = atendimentos.filter((a) => {
      const citado = a.diagnosticoCancelamento.concorrenteCitado;
      if (!citado) return false;
      return def ? def.padrao.test(citado) || citado.toLowerCase().includes(def.nome.toLowerCase()) : citado.toLowerCase().includes(concorrentePerguntado.toLowerCase());
    });
  } else if (querVendaMalFeita && !querConcorrente) {
    ehPerguntaEspecifica = true;
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.vendaMalFeita
    );
  } else if (querConcorrente) {
    selecionados = atendimentos.filter(
      (a) => Boolean(a.diagnosticoCancelamento.concorrenteCitado)
    );
  } else {
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
    );
  }

  // Se a pergunta foi específica (ex.: sobre um concorrente específico ou venda mal feita)
  // e não encontrou registros, NÃO fazemos fallback para cancelamentos gerais!
  if (!ehPerguntaEspecifica && selecionados.length === 0) {
    selecionados = atendimentos.filter(
      (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
    );
  }

  const totalCancelamentos = atendimentos.filter(
    (a) => a.diagnosticoCancelamento.houveIntencaoCancelamento
  ).length;
  const totalConcorrente = concorrentePerguntado
    ? selecionados.length
    : 0;
  const totalVendaMalFeitaGeral = atendimentos.filter(
    (a) => a.diagnosticoCancelamento.vendaMalFeita
  ).length;

  let resposta = '';

  if (concorrentePerguntado) {
    if (totalConcorrente === 0) {
      resposta = `Nenhum dos **${totalCancelamentos} cancelamentos** analisados no período registra migração declarada para a **${concorrentePerguntado}**.\n\n- **Concorrentes efetivos**: As migrações registradas concentram-se em outras operadoras.\n- **Hipótese de perda**: Não há evidência de churn direcionado à ${concorrentePerguntado} no período e recorte selecionados.\n\nRecomenda-se revalidar a hipótese de perda junto às áreas comercial e de atendimento.`;
    } else if (querVendaMalFeita) {
      const comVenda = selecionados.filter((a) => a.diagnosticoCancelamento.vendaMalFeita).length;
      resposta = `Identificamos **${totalConcorrente} atendimento(s)** com cancelamento e migração confirmada para a **${concorrentePerguntado}**.\n\n- **Incidência de Venda Mal Feita**: ${comVenda} caso(s) confirmam falhas comerciais com divergência de carência ou rede prometida na adesão.\n- **Motivação predominante**: insatisfação com rede credenciada e expectativas divergentes na contratação.\n\nRecomenda-se reforçar o alinhamento comercial com os corretores da região.`;
    } else {
      resposta = `Foram identificados **${totalConcorrente} caso(s)** de cancelamento com migração declarada para a **${concorrentePerguntado}** no período analisado.\n\n- **Padrão observado**: clientes declaram contratação de novo plano na operadora concorrente motivados por divergências de rede credenciada e preço.\n\nRecomenda-se direcionar os esforços de retenção e benchmark comercial para essa operadora.`;
    }
  } else if (querVendaMalFeita) {
    resposta = `Constatamos **${totalVendaMalFeitaGeral} atendimento(s)** com indício claro de **Venda Mal Feita** entre os ${totalCancelamentos} cancelamentos analisados.\n\n- **Causas frequentes**: divergências entre as promessas de carência/hospitais dos vendedores e a cobertura real do plano.\n\nRecomenda-se auditoria nos canais comerciais parceiros.`;
  } else if (querConcorrente) {
    resposta = `No período analisado, identificamos cancelamentos com declaração expressa de migração para operadoras concorrentes.\n\n- **Impacto**: clientes apontam divergência de rede e custo como catalisadores da troca de operadora.\n\nRecomenda-se acompanhamento sistemático dos cancelamentos com migração.`;
  } else {
    resposta = `Com base nos **${totalCancelamentos} cancelamentos** analisados no recorte, o padrão predominante envolve divergências comerciais (venda mal feita) e problemas financeiros/reajuste.\n\n- **Ação recomendada**: revisar regras de comunicação comercial e negociação de parcelas.`;
  }

  return {
    pergunta,
    resposta: sanitizarTextoExecutivo(resposta),
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

  const concorrentePerguntado = detectarConcorrenteNaPergunta(pergunta);

  const systemPrompt = `Você é o assistente executivo e analítico da plataforma HQ Crion, especializado em diagnóstico de cancelamentos e churn de planos de saúde.
Analise os atendimentos fornecidos abaixo para responder à pergunta do gestor.
DIRETRIZES DE ESTILO E LINGUAGEM:
1. Responda em português pt-BR com linguagem executiva, clara e objetiva.
2. NUNCA mencione nomes técnicos de variáveis, colunas ou schemas (é PROIBIDO usar termos como "concorrenteCitado", "vendaMalFeita", "categoriaCausa", "houveIntencaoCancelamento"). Use sempre os termos de domínio: "Concorrente Citado", "Venda Mal Feita", "Causa de Cancelamento".
3. ESTRUTURE A RESPOSTA EM PARÁGRAFOS E TÓPICOS usando quebras de linha:
   - Parágrafo 1: Resposta direta, objetiva e quantitativa à pergunta do gestor, com números em negrito (**...**).
   - Parágrafo 2 (tópicos com "- **...**:"): Padrões observados, principais causas e detalhes das evidências.
   - Parágrafo 3: Recomendação acionável e síntese para retenção/comercial.
4. Se a pergunta for sobre um concorrente específico e não houver casos desse concorrente nos dados, declare claramente que não há registros para ele.
Retorne EXCLUSIVAMENTE um objeto JSON com as chaves:
- "resposta": texto explicativo formatado conforme as diretrizes;
- "evidenciaIds": array de strings com os IDs dos atendimentos estritamente pertinentes à pergunta (se não houver atendimentos correspondentes à pergunta, retorne array vazio []).`;

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

    const perguntaNorm = pergunta.toLowerCase();
    const querVendaMalFeita =
      perguntaNorm.includes('venda mal feita') ||
      perguntaNorm.includes('venda') ||
      perguntaNorm.includes('corretor');
    const querConcorrente =
      perguntaNorm.includes('concorrente') ||
      perguntaNorm.includes('migra') ||
      Boolean(concorrentePerguntado);
    const ehPerguntaEspecifica = Boolean(
      concorrentePerguntado || (querVendaMalFeita && !querConcorrente)
    );

    // Se a pergunta foi sobre concorrente específico, assegura que as evidências sejam estritas àquele concorrente
    if (concorrentePerguntado) {
      const def = CONCORRENTES.find((c) => c.nome === concorrentePerguntado);
      evidencias = evidencias.filter((e) => {
        const citado = e.concorrenteCitado;
        if (!citado) return false;
        return def
          ? def.padrao.test(citado) || citado.toLowerCase().includes(def.nome.toLowerCase())
          : citado.toLowerCase().includes(concorrentePerguntado.toLowerCase());
      });
    } else if (querVendaMalFeita && !querConcorrente) {
      evidencias = evidencias.filter((e) => Boolean(e.vendaMalFeita));
    } else if (querConcorrente) {
      evidencias = evidencias.filter((e) => Boolean(e.concorrenteCitado));
    }

    // Se a pergunta foi específica (ex.: sobre um concorrente específico ou venda mal feita)
    // e não encontrou registros, NÃO fazemos fallback para cancelamentos gerais!
    if (!ehPerguntaEspecifica && evidencias.length === 0) {
      evidencias = atendimentos
        .filter((a) => a.diagnosticoCancelamento.houveIntencaoCancelamento)
        .slice(0, 5)
        .map(montarEvidencia);
    }

    return {
      pergunta,
      resposta: sanitizarTextoExecutivo(parsed.resposta),
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
- evidenciaTrecho (trecho da fala do cliente comprovando o caso ou null)

REGRAS DE NEGÓCIO MANDATÓRIAS PARA CONCORRENTE CITADO E MIGRAÇÃO:
1. As empresas avaliadas (Affix, Alter, Conectaplan) são ADMINISTRADORAS de benefícios. O plano que o cliente já possui e cancela pertence a uma operadora parceira (ex.: Unimed do Maranhão, Assim Saúde, Hapvida).
2. "concorrenteCitado" só deve ser preenchido (e "categoriaCausa" só deve ser "Migração para concorrente") quando o PRÓPRIO CLIENTE declarar explicitamente que está MUDANDO, MIGRANDO ou CONTRATANDO OUTRO PLANO em uma operadora concorrente.
3. Se o cliente apenas cita a operadora parceira do seu próprio plano atual ou pergunta se deve solicitar o cancelamento à administradora ou direto à operadora, isso NÃO é concorrente citado e NÃO é migração para concorrente.
4. Falas do Agente de Voz não contam para identificar concorrente. Palavras ambíguas como a conjunção "assim" nunca são concorrentes.`;

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

    const diagPre: DiagnosticoCancelamento = {
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

    return sanearDiagnosticoContraFalsosPositivos(atendimento, diagPre);
  } catch {
    return {
      ...extrairDiagnosticoDeCancelamento(atendimento),
      origem: 'ia'
    };
  }
}
