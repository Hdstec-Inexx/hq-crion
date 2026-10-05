import {
  type DetalheDaFerramenta,
  type ResultadoDaChamada
} from '@hq-crion/contracts/ferramenta';

export type ItemDaFonte = {
  tool_name?: string;
  name?: string;
  toolName?: string;
  tool_call_id?: string;
  request_id?: string;
  tool_has_been_called?: boolean;
  is_called?: boolean;
  is_error?: boolean;
  error?: unknown;
  status?: string;
  type?: string;
  params_as_json?: string;
  parameters?: unknown;
  result_value?: unknown;
  result?: unknown;
  reasoning?: unknown;
  thought?: unknown;
  tool_latency_secs?: number;
  tool_type?: string;
};

export type ContextoDaChamada = {
  tempoNoAtendimento?: string;
  tempoDoLlm?: string;
  raciocinio?: string;
};

export function nomeDaFerramenta(item: ItemDaFonte) {
  const nome = item.tool_name ?? item.name ?? item.toolName;
  return typeof nome === 'string' && nome.trim() ? nome.trim() : undefined;
}

export function chamadaExecutada(item: ItemDaFonte) {
  return item.tool_has_been_called !== false && item.is_called !== false && item.status !== 'skipped';
}

export function textoDeDuracao(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) {
    return undefined;
  }

  if (segundos < 1) {
    return `${Math.round(segundos * 1000)} ms`;
  }

  return `${segundos.toFixed(1).replace('.', ',')} s`;
}

function comoObjeto(valor: unknown) {
  if (!valor) {
    return undefined;
  }

  if (typeof valor === 'string') {
    try {
      const lido = JSON.parse(valor) as unknown;
      if (lido && typeof lido === 'object' && !Array.isArray(lido)) {
        return lido as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  if (typeof valor === 'object' && !Array.isArray(valor)) {
    return valor as Record<string, unknown>;
  }

  return undefined;
}

function textoDeCampo(objeto: Record<string, unknown> | undefined, chave: string) {
  const valor = objeto?.[chave];

  if (typeof valor === 'string' && valor.trim()) {
    return valor.trim();
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return String(valor);
  }

  return undefined;
}

export function textoJson(valor: unknown) {
  if (valor === undefined || valor === null) {
    return undefined;
  }

  if (typeof valor === 'string') {
    const objeto = comoObjeto(valor);
    if (objeto) {
      return JSON.stringify(objeto, null, 2);
    }

    const texto = valor.trim();
    return texto || undefined;
  }

  if (typeof valor === 'object') {
    return JSON.stringify(valor, null, 2);
  }

  return String(valor);
}

function raciocinioDe(valor: unknown) {
  if (typeof valor === 'string' && valor.trim()) {
    return valor.trim();
  }

  const objeto = comoObjeto(valor);

  if (!objeto) {
    return undefined;
  }

  for (const chave of ['summary', 'text', 'reasoning', 'content']) {
    const texto = textoDeCampo(objeto, chave);
    if (texto) {
      return texto;
    }
  }

  return undefined;
}

function parametrosDe(item: ItemDaFonte) {
  if (typeof item.params_as_json === 'string' && item.params_as_json.trim()) {
    return textoJson(item.params_as_json);
  }

  if (item.parameters !== undefined) {
    return textoJson(item.parameters);
  }

  return undefined;
}

function corpoDoResultado(item: ItemDaFonte) {
  if (item.result_value !== undefined) {
    return item.result_value;
  }

  if (item.result !== undefined) {
    return item.result;
  }

  return undefined;
}

function procedimentoDe(nome: string, ...objetos: Array<Record<string, unknown> | undefined>) {
  if (nome === 'start_procedure' || nome === 'end_procedure') {
    return true;
  }

  return objetos.some((objeto) => {
    if (!objeto) {
      return false;
    }

    return Boolean(
      objeto.procedure_id || objeto.procedure_name || objeto.procedure_index !== undefined
    );
  });
}

export function resultadoFalhou(item: ItemDaFonte) {
  return (
    item.is_error === true ||
    Boolean(item.error) ||
    item.status === 'error' ||
    item.status === 'failure' ||
    item.status === 'Falha' ||
    item.status === 'blocked'
  );
}

export function detalheDaChamada(
  item: ItemDaFonte,
  contexto: ContextoDaChamada = {}
): DetalheDaFerramenta | undefined {
  const nomeDaFerramentaBruto = nomeDaFerramenta(item);

  if (!nomeDaFerramentaBruto || !chamadaExecutada(item)) {
    return undefined;
  }

  const parametros = parametrosDe(item);
  const params = comoObjeto(parametros);
  const procedimento = procedimentoDe(nomeDaFerramentaBruto, params);
  const id = (item.tool_call_id ?? item.request_id)?.trim() || undefined;
  const raciocinio = raciocinioDe(item.reasoning) ?? raciocinioDe(item.thought) ?? contexto.raciocinio;
  const nome =
    (procedimento
      ? textoDeCampo(params, 'procedure_name') ??
        textoDeCampo(params, 'procedure_index') ??
        textoDeCampo(params, 'procedure_id')
      : undefined) ?? nomeDaFerramentaBruto;

  return {
    tipo: procedimento ? 'Procedimento' : 'Ferramenta',
    ...(procedimento
      ? { acao: nomeDaFerramentaBruto === 'end_procedure' ? ('encerrou' as const) : ('iniciou' as const) }
      : {}),
    nome,
    nomeDaFerramenta: nomeDaFerramentaBruto,
    ...(id ? { id } : {}),
    ...(textoDeCampo(params, 'procedure_id')
      ? { idDoProcedimento: textoDeCampo(params, 'procedure_id') }
      : {}),
    ...(textoDeCampo(params, 'procedure_index')
      ? { indiceDoProcedimento: textoDeCampo(params, 'procedure_index') }
      : {}),
    ...(raciocinio ? { raciocinio } : {}),
    ...(parametros ? { parametros } : {}),
    ...(contexto.tempoNoAtendimento ? { tempoNoAtendimento: contexto.tempoNoAtendimento } : {}),
    ...(contexto.tempoDoLlm ? { tempoDoLlm: contexto.tempoDoLlm } : {}),
    ...(tipoDaFonteDe(item) ? { tipoDaFonte: tipoDaFonteDe(item) } : {})
  };
}

function tipoDaFonteDe(item: ItemDaFonte) {
  const tipo = item.type ?? item.tool_type;
  return typeof tipo === 'string' && tipo.trim() ? tipo.trim() : undefined;
}

export function resultadoDaFonte(item: ItemDaFonte): ResultadoDaChamada | undefined {
  const nome = nomeDaFerramenta(item);

  if (!nome || !chamadaExecutada(item)) {
    return undefined;
  }

  const corpo = corpoDoResultado(item) ?? (item.error === undefined ? undefined : item.error);
  const objeto = comoObjeto(typeof corpo === 'string' ? corpo : corpo);
  const resposta = textoJson(corpo);
  const raciocinio = raciocinioDe(item.reasoning) ?? raciocinioDe(item.thought);
  const tempo =
    typeof item.tool_latency_secs === 'number' ? textoDeDuracao(item.tool_latency_secs) : undefined;
  const id = (item.tool_call_id ?? item.request_id)?.trim() || undefined;

  return {
    ...(id ? { id } : {}),
    nome,
    ...(textoDeCampo(objeto, 'procedure_name')
      ? { nomeDoProcedimento: textoDeCampo(objeto, 'procedure_name') }
      : {}),
    ...(textoDeCampo(objeto, 'procedure_id')
      ? { idDoProcedimento: textoDeCampo(objeto, 'procedure_id') }
      : {}),
    ...(textoDeCampo(objeto, 'procedure_index')
      ? { indiceDoProcedimento: textoDeCampo(objeto, 'procedure_index') }
      : {}),
    veredito: resultadoFalhou(item) ? 'Falha' : 'Sucesso',
    ...(resposta ? { resposta } : {}),
    ...(tempo ? { tempoDeExecucao: tempo } : {}),
    ...(tipoDaFonteDe(item) ? { tipoDaFonte: tipoDaFonteDe(item) } : {}),
    ...(raciocinio ? { raciocinio } : {})
  };
}

export function tempoDoLlm(metrics: unknown) {
  if (!metrics || typeof metrics !== 'object') {
    return undefined;
  }

  for (const [chave, valor] of Object.entries(metrics)) {
    if (!/llm/i.test(chave) || !valor || typeof valor !== 'object') {
      continue;
    }

    const elapsed = (valor as { elapsed_time?: unknown }).elapsed_time;

    if (typeof elapsed === 'number') {
      return textoDeDuracao(elapsed);
    }
  }

  return undefined;
}
