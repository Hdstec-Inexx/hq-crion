import { maximoDoTextoDaFala } from '@hq-crion/contracts/atendimento';
import {
  acaoDoProcedimento,
  ehFerramentaDeProcedimento,
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
  full_tool_result?: unknown;
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

export function chamadaRecusada(item: ItemDaFonte) {
  return item.is_called === false || item.status === 'skipped';
}

export function chamadaExecutada(item: ItemDaFonte) {
  return !chamadaRecusada(item) && item.tool_has_been_called !== false;
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

function limitarTexto(texto: string | undefined) {
  if (!texto) {
    return undefined;
  }

  return texto.length > maximoDoTextoDaFala ? texto.slice(0, maximoDoTextoDaFala) : texto;
}

export function textoJson(valor: unknown) {
  if (valor === undefined || valor === null) {
    return undefined;
  }

  if (typeof valor === 'string') {
    if (valor.length > maximoDoTextoDaFala) {
      return valor.slice(0, maximoDoTextoDaFala);
    }

    const objeto = comoObjeto(valor);
    if (objeto) {
      return limitarTexto(JSON.stringify(objeto, null, 2));
    }

    const texto = valor.trim();
    return texto || undefined;
  }

  if (typeof valor === 'object') {
    return limitarTexto(JSON.stringify(valor, null, 2));
  }

  return limitarTexto(String(valor));
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

  if (item.full_tool_result !== undefined) {
    return item.full_tool_result;
  }

  return undefined;
}

function camposDoProcedimento(objeto: Record<string, unknown> | undefined) {
  return {
    nome: textoDeCampo(objeto, 'procedure_name'),
    id: textoDeCampo(objeto, 'procedure_id'),
    indice: textoDeCampo(objeto, 'procedure_index')
  };
}

function procedimentoDe(nome: string, ...objetos: Array<Record<string, unknown> | undefined>) {
  if (nome === 'transfer_to_number') {
    return false;
  }

  if (ehFerramentaDeProcedimento(nome)) {
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

export type DetalheDaChamada = DetalheDaFerramenta & { pendente?: boolean };

export function detalheDaChamada(
  item: ItemDaFonte,
  contexto: ContextoDaChamada = {}
): DetalheDaChamada | undefined {
  const nomeDaFerramentaBruto = nomeDaFerramenta(item);

  if (!nomeDaFerramentaBruto || chamadaRecusada(item)) {
    return undefined;
  }

  const parametros = parametrosDe(item);
  const params = comoObjeto(parametros);
  const procedimento = procedimentoDe(nomeDaFerramentaBruto, params);
  const id = (item.tool_call_id ?? item.request_id)?.trim() || undefined;
  const raciocinio = limitarTexto(
    raciocinioDe(item.reasoning) ?? raciocinioDe(item.thought) ?? contexto.raciocinio
  );
  const procedimentoCampos = camposDoProcedimento(params);
  const nome =
    (procedimento
      ? procedimentoCampos.nome ?? procedimentoCampos.indice ?? procedimentoCampos.id
      : undefined) ?? nomeDaFerramentaBruto;

  return {
    tipo: procedimento ? 'Procedimento' : 'Ferramenta',
    ...(procedimento ? { acao: acaoDoProcedimento(nomeDaFerramentaBruto) } : {}),
    nome,
    nomeDaFerramenta: nomeDaFerramentaBruto,
    ...(id ? { id } : {}),
    ...(procedimento && procedimentoCampos.id ? { idDoProcedimento: procedimentoCampos.id } : {}),
    ...(procedimento && procedimentoCampos.indice ? { indiceDoProcedimento: procedimentoCampos.indice } : {}),
    ...(raciocinio ? { raciocinio } : {}),
    ...(parametros ? { parametros } : {}),
    ...(contexto.tempoNoAtendimento ? { tempoNoAtendimento: contexto.tempoNoAtendimento } : {}),
    ...(contexto.tempoDoLlm ? { tempoDoLlm: contexto.tempoDoLlm } : {}),
    ...(tipoDaFonteDe(item) ? { tipoDaFonte: tipoDaFonteDe(item) } : {}),
    ...(item.tool_has_been_called === false ? { pendente: true as const } : {})
  };
}

function tipoDaFonteDe(item: ItemDaFonte) {
  const tipo = item.type ?? item.tool_type;
  const texto = typeof tipo === 'string' ? tipo.trim() : '';
  return texto ? texto.slice(0, 64) : undefined;
}

export function resultadoDaFonte(item: ItemDaFonte): ResultadoDaChamada | undefined {
  const nome = nomeDaFerramenta(item);

  const id = (item.tool_call_id ?? item.request_id)?.trim() || undefined;

  if ((!nome && !id) || !chamadaExecutada(item)) {
    return undefined;
  }

  const corpo = corpoDoResultado(item) ?? (item.error === undefined ? undefined : item.error);
  const objeto = comoObjeto(typeof corpo === 'string' ? corpo : corpo);
  const procedimento =
    nome === 'transfer_to_number'
      ? { nome: undefined, id: undefined, indice: undefined }
      : camposDoProcedimento(objeto);
  const resposta = textoJson(corpo);
  const raciocinio = limitarTexto(raciocinioDe(item.reasoning) ?? raciocinioDe(item.thought));
  const tempo =
    typeof item.tool_latency_secs === 'number' ? textoDeDuracao(item.tool_latency_secs) : undefined;
  return {
    ...(id ? { id } : {}),
    ...(nome ? { nome } : {}),
    ...(procedimento.nome ? { nomeDoProcedimento: procedimento.nome } : {}),
    ...(procedimento.id ? { idDoProcedimento: procedimento.id } : {}),
    ...(procedimento.indice ? { indiceDoProcedimento: procedimento.indice } : {}),
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
