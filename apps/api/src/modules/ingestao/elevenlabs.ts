import {
  textoDaChamadaDeFerramenta,
  type TurnoDaTranscricao
} from '@hq-crion/contracts/atendimento';
import { aplicarResultados, type DetalheDaFerramenta } from '@hq-crion/contracts/ferramenta';
import {
  chamadaExecutada,
  detalheDaChamada,
  nomeDaFerramenta,
  resultadoDaFonte,
  tempoDoLlm,
  type ItemDaFonte
} from '../ferramenta/da-fonte.js';
import {
  administradoras,
  agentesDeVoz,
  type Administradora,
  type Recorte
} from '@hq-crion/contracts/recorte';
import { camposDeMidia, type RegistroDeAtendimento } from '../atendimentos/registro.js';
import {
  quandoDaFonte,
  tempoDeEsperaDaTranscricao
} from '../atendimentos/tempo-de-espera.js';

export type PayloadElevenLabs = {
  conversation_id: string;
  agent_id: string;
  agent_name?: string;
  status?: string;
  has_audio?: boolean;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  termination_reason?: string;
  call_successful?: string;
  metadata?: { cost?: number; start_time_unix_secs?: number };
  transcript?: TurnoDaFonteElevenLabs[];
};

type TurnoDaFonteElevenLabs = {
  role: string;
  message?: string;
  time_in_call_secs?: number;
  tool_name?: string;
  reasoning?: unknown;
  conversation_turn_metrics?: unknown;
  tool_calls?: ItemDaFonte[];
  tool_results?: ItemDaFonte[];
};

export type AtendimentoColetado = RegistroDeAtendimento & {
  midia?: Buffer;
  tipoDaMidia?: string;
};

function locutorDe(role: string): 'Agente de Voz' | 'Cliente' {
  return role === 'user' || role === 'cliente' ? 'Cliente' : 'Agente de Voz';
}

export function caminhoDaMidia(id: string) {
  return `/media/${id}.wav`;
}

const statusAbertoNaFonte = new Set(['initiated', 'in-progress']);
const desfechoTerminalNaFonte = new Set(['success', 'failure']);
const idadeMaximaAoVivoSegundos = 24 * 60 * 60;
const folgaDaDuracaoAoVivoSegundos = 10 * 60;

export function conversaAbertaNaFonte(status: string | undefined) {
  return statusAbertoNaFonte.has(status ?? '');
}

export function conversaAtivaNaFonte(
  payload: PayloadElevenLabs,
  agoraSegundos = Math.floor(Date.now() / 1000)
) {
  if (!conversaAbertaNaFonte(payload.status)) {
    return false;
  }

  if (payload.termination_reason?.trim()) {
    return false;
  }

  if (
    typeof payload.call_successful === 'string' &&
    desfechoTerminalNaFonte.has(payload.call_successful)
  ) {
    return false;
  }

  const inicio = [payload.start_time_unix_secs, payload.metadata?.start_time_unix_secs].find(
    (valor) => typeof valor === 'number' && Number.isInteger(valor) && valor > 0
  );

  if (inicio === undefined) {
    return false;
  }

  const idade = agoraSegundos - inicio;

  if (idade > idadeMaximaAoVivoSegundos) {
    return false;
  }

  const duracao =
    typeof payload.call_duration_secs === 'number' &&
    Number.isFinite(payload.call_duration_secs) &&
    payload.call_duration_secs >= 0
      ? payload.call_duration_secs
      : 0;

  return idade <= duracao + folgaDaDuracaoAoVivoSegundos;
}

function nomesDeFerramenta(payload: PayloadElevenLabs) {
  const nomes: string[] = [];

  for (const turno of payload.transcript ?? []) {
    if (turno.tool_calls?.length || turno.tool_results?.length) {
      for (const chamada of turno.tool_calls ?? []) {
        const nome = nomeDaFerramenta(chamada);
        if (nome && chamadaExecutada(chamada)) {
          nomes.push(nome);
        }
      }

      for (const resultado of turno.tool_results ?? []) {
        const nome = nomeDaFerramenta(resultado);
        if (nome && chamadaExecutada(resultado)) {
          nomes.push(nome);
        }
      }
      continue;
    }

    if (turno.tool_name) {
      nomes.push(turno.tool_name);
    }
  }

  return nomes;
}

export function transferenciaDaFonte(payload: PayloadElevenLabs) {
  return nomesDeFerramenta(payload).some((nome) => /transfer/i.test(nome));
}

export function custoDaFonte(payload: PayloadElevenLabs) {
  const bruto = payload.metadata?.cost;

  if (typeof bruto !== 'number' || !Number.isFinite(bruto) || bruto < 0) {
    return undefined;
  }

  return `R$ ${bruto.toFixed(2).replace('.', ',')}`;
}

function contextoDoTurno(turno: TurnoDaFonteElevenLabs) {
  const comTempo = typeof turno.time_in_call_secs === 'number';
  const llm = tempoDoLlm(turno.conversation_turn_metrics);
  const raciocinio = typeof turno.reasoning === 'string' ? turno.reasoning.trim() : '';

  return {
    ...(comTempo ? { tempoNoAtendimento: quandoDaFonte(turno.time_in_call_secs as number) } : {}),
    ...(llm ? { tempoDoLlm: llm } : {}),
    ...(raciocinio ? { raciocinio } : {})
  };
}

function resultadoComNomeDaChamada(resultado: ItemDaFonte, nomes: Map<string, string>) {
  if (nomeDaFerramenta(resultado)) {
    return resultado;
  }

  const id = resultado.tool_call_id ?? resultado.request_id;
  const nome = id ? nomes.get(id) : undefined;
  return nome ? { ...resultado, tool_name: nome } : resultado;
}

function turnosDaFonte(payload: PayloadElevenLabs) {
  const nomesPorId = new Map<string, string>();

  for (const turno of payload.transcript ?? []) {
    for (const chamada of turno.tool_calls ?? []) {
      const nome = nomeDaFerramenta(chamada);
      const id = chamada.tool_call_id ?? chamada.request_id;
      if (nome && id) {
        nomesPorId.set(id, nome);
      }
    }
  }

  const turnosComChamadas = (payload.transcript ?? []).map((turno) => {
    const contexto = contextoDoTurno(turno);
    const detalhes = (turno.tool_calls ?? [])
      .map((chamada) => detalheDaChamada(chamada, contexto))
      .filter((detalhe): detalhe is DetalheDaFerramenta => Boolean(detalhe));

    if (!detalhes.length && turno.tool_name?.trim()) {
      const avulso = detalheDaChamada({ tool_name: turno.tool_name }, contexto);
      if (avulso) {
        detalhes.push(avulso);
      }
    }

    return {
      locutor: locutorDe(turno.role),
      fala: turno.message?.trim() ?? '',
      quando:
        typeof turno.time_in_call_secs === 'number' ? quandoDaFonte(turno.time_in_call_secs) : '—',
      comTempo: typeof turno.time_in_call_secs === 'number',
      detalhes,
      resultados: (turno.tool_results ?? [])
        .map((resultado) => resultadoDaFonte(resultadoComNomeDaChamada(resultado, nomesPorId)))
        .filter((resultado): resultado is NonNullable<typeof resultado> => Boolean(resultado))
    };
  });

  const comResultados = aplicarResultados(
    turnosComChamadas,
    turnosComChamadas.flatMap((turno) => turno.resultados)
  );

  return comResultados.flatMap((turno) => {
    const detalhes = turno.detalhes ?? [];
    const texto = [
      turno.fala,
      ...detalhes.map((detalhe) => textoDaChamadaDeFerramenta(detalhe.nomeDaFerramenta))
    ]
      .filter(Boolean)
      .join('\n');

    if (!texto) {
      return [];
    }

    return [
      {
        locutor: turno.locutor,
        quando: turno.quando,
        texto,
        comTempo: turno.comTempo,
        ...(detalhes.length ? { detalhes } : {})
      }
    ];
  });
}

function turnoPublico(turno: {
  locutor: TurnoDaTranscricao['locutor'];
  quando: string;
  texto: string;
  detalhes?: DetalheDaFerramenta[];
}): TurnoDaTranscricao {
  return {
    locutor: turno.locutor,
    quando: turno.quando,
    texto: turno.texto,
    ...(turno.detalhes?.length ? { detalhes: turno.detalhes } : {})
  };
}

function segundosDeInicio(valor: unknown) {
  if (typeof valor === 'number' && Number.isInteger(valor) && valor > 0) {
    return valor;
  }

  return undefined;
}

export function instanteDeInicioDaFonte(payload: PayloadElevenLabs) {
  const segundos =
    segundosDeInicio(payload.start_time_unix_secs) ??
    segundosDeInicio(payload.metadata?.start_time_unix_secs);

  if (segundos === undefined) {
    return undefined;
  }

  return new Date(segundos * 1000).toISOString();
}

export type LeituraAoVivo = {
  id: string;
  administradora: Administradora | null;
  agente: string;
  agenteId: string;
  iniciadoEm?: string;
  motivo: string;
  transcricao: TurnoDaTranscricao[];
};

export function administradoraNoNomeDoAgente(nome: string): Administradora | null {
  const texto = nome.toLocaleLowerCase('pt-BR');
  const achadas = administradoras.filter((nomeAdm) =>
    texto.includes(nomeAdm.toLocaleLowerCase('pt-BR'))
  );

  if (achadas.length === 0) {
    return null;
  }

  return achadas.reduce((maior, atual) => (atual.length > maior.length ? atual : maior));
}

export function cabeNoRecorteAoVivo(
  item: { administradora: Administradora | null; agente: string; agenteId: string },
  recorte: Recorte
) {
  if (!recorte.administradora && !recorte.agente) {
    return true;
  }

  const administradora = item.administradora ?? administradoraNoNomeDoAgente(item.agente);

  if (recorte.administradora && administradora !== recorte.administradora) {
    return false;
  }

  if (!recorte.agente) {
    return true;
  }

  if (item.agenteId === recorte.agente) {
    return true;
  }

  const doCatalogo = agentesDeVoz.find((agente) => agente.id === recorte.agente);

  return doCatalogo
    ? item.agente.toLocaleLowerCase('pt-BR').includes(doCatalogo.nome.toLocaleLowerCase('pt-BR'))
    : false;
}

export function leituraAoVivoDaFonte(payload: PayloadElevenLabs): LeituraAoVivo | undefined {
  if (!payload.conversation_id || !payload.agent_id) {
    return undefined;
  }

  const agente = agentesDeVoz.find((item) => item.id === payload.agent_id);
  const nomeDaFonte = payload.agent_name?.trim();
  const nome = nomeDaFonte || agente?.nome || payload.agent_id;
  const turnos = turnosDaFonte(payload);

  return {
    id: payload.conversation_id,
    administradora: agente?.administradora ?? null,
    agente: nome,
    agenteId: payload.agent_id,
    iniciadoEm: instanteDeInicioDaFonte(payload),
    motivo: 'Não informado',
    transcricao: turnos.map(turnoPublico)
  };
}

export function atendimentoDaFonteElevenLabs(
  payload: PayloadElevenLabs
): RegistroDeAtendimento | undefined {
  const agente = agentesDeVoz.find((item) => item.id === payload.agent_id);

  if (!agente) {
    return undefined;
  }

  const iniciadoEm = instanteDeInicioDaFonte(payload);

  if (!iniciadoEm) {
    return undefined;
  }

  const concluido = payload.status === 'done' || payload.status === 'completed';
  const transcricao = turnosDaFonte(payload);
  const tempoDeEsperaEmSegundos = tempoDeEsperaDaTranscricao(
    transcricao.map((turno) => ({
      locutor: turno.locutor,
      quando: turno.comTempo ? turno.quando : '',
      texto: turno.texto
    }))
  );
  const custo = custoDaFonte(payload);

  return {
    id: payload.conversation_id,
    administradora: agente.administradora,
    agente: payload.agent_name ?? agente.nome,
    agenteId: agente.id,
    iniciadoEm,
    motivo: 'Não informado',
    nota: 0,
    status: concluido ? 'Concluído' : 'Em andamento',
    curadoria: false,
    conversa: payload.conversation_id,
    transcricao: transcricao.map(turnoPublico),
    transferencia: transferenciaDaFonte(payload),
    ...(custo ? { custo } : {}),
    ...(tempoDeEsperaEmSegundos !== undefined ? { tempoDeEsperaEmSegundos } : {}),
    ...(concluido ? { concluidoEm: iniciadoEm } : {}),
    ...(payload.call_duration_secs !== undefined
      ? { duracaoEmSegundos: payload.call_duration_secs }
      : {})
  };
}

type ListaElevenLabs = {
  conversations?: PayloadElevenLabs[];
  has_more?: boolean;
  next_cursor?: string | null;
};

const limiteDeMidia = 25 * 1024 * 1024;
const limiteDePaginas = 20;
const esperaDaFonteMs = 8_000;
const tentativasDaFonte = 2;

function urlDaFonte(baseUrl: string, caminho: string) {
  return `${baseUrl.replace(/\/$/, '')}${caminho}`;
}

export function tipoDeMidia(bruto: string | null) {
  const tipo = (bruto ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return /^audio\/[a-z0-9.+-]+$/.test(tipo) ? tipo : undefined;
}

async function respostaDaFonte(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  signal?: AbortSignal,
  esperaMs = esperaDaFonteMs
) {
  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa < tentativasDaFonte; tentativa += 1) {
    buscaCancelada(signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), esperaMs);
    const cancelar = () => controller.abort();
    signal?.addEventListener('abort', cancelar, { once: true });

    try {
      return await fetchImpl(url, {
        headers: { 'xi-api-key': apiKey },
        signal: controller.signal
      });
    } catch (error) {
      ultimoErro = error;
      const estourouTempo = controller.signal.aborted && !signal?.aborted;

      if (!estourouTempo) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancelar);
    }
  }

  throw ultimoErro;
}

async function buscarJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  signal?: AbortSignal,
  esperaMs = esperaDaFonteMs
) {
  const resposta = await respostaDaFonte(fetchImpl, url, apiKey, signal, esperaMs);

  if (!resposta.ok) {
    return undefined;
  }

  return (await resposta.json()) as unknown;
}

export async function baixarAudio(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  id: string
) {
  const resposta = await respostaDaFonte(
    fetchImpl,
    urlDaFonte(baseUrl, `/v1/convai/conversations/${encodeURIComponent(id)}/audio`),
    apiKey
  );
  const tipo = tipoDeMidia(resposta.headers.get('content-type'));
  const anunciado = Number(resposta.headers.get('content-length'));

  if (
    !resposta.ok ||
    !tipo ||
    (Number.isFinite(anunciado) && anunciado > limiteDeMidia)
  ) {
    return undefined;
  }

  const midia = await lerCorpoLimitado(resposta, limiteDeMidia);

  if (!midia || midia.byteLength === 0) {
    return undefined;
  }

  return { conteudo: midia, tipo };
}

async function lerCorpoLimitado(resposta: Response, limite: number) {
  const leitor = resposta.body?.getReader();

  if (!leitor) {
    const midia = Buffer.from(await resposta.arrayBuffer());
    return midia.byteLength > limite ? undefined : midia;
  }

  const partes: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await leitor.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > limite) {
      await leitor.cancel();
      return undefined;
    }

    partes.push(value);
  }

  return Buffer.concat(partes);
}

function buscaCancelada(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error('busca cancelada');
  error.name = 'AbortError';
  throw error;
}

export async function listarConversasElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  maxPaginas?: number;
  signal?: AbortSignal;
  esperaMs?: number;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const conversas: PayloadElevenLabs[] = [];
  let cursor: string | undefined;
  const maxPaginas = input.maxPaginas ?? limiteDePaginas;

  for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
    buscaCancelada(input.signal);
    const exclusoes = ['done', 'failed', 'processing']
      .map((status) => `exclude_statuses=${encodeURIComponent(status)}`)
      .join('&');
    const caminho = cursor
      ? `/v1/convai/conversations?${exclusoes}&cursor=${encodeURIComponent(cursor)}`
      : `/v1/convai/conversations?${exclusoes}`;
    const corpo = (await buscarJson(
      fetchImpl,
      urlDaFonte(input.baseUrl, caminho),
      input.apiKey,
      input.signal,
      input.esperaMs
    )) as ListaElevenLabs | undefined;

    if (!corpo) {
      throw new Error('ElevenLabs não listou as conversas');
    }

    conversas.push(...(corpo.conversations ?? []));

    if (!corpo.has_more || !corpo.next_cursor || corpo.next_cursor === cursor) {
      break;
    }

    cursor = corpo.next_cursor;
  }

  return conversas;
}

export async function buscarConversaElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  id: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const resposta = await respostaDaFonte(
    fetchImpl,
    urlDaFonte(input.baseUrl, `/v1/convai/conversations/${encodeURIComponent(input.id)}`),
    input.apiKey
  );

  if (resposta.status === 404) {
    return undefined;
  }

  if (!resposta.ok) {
    throw new Error('ElevenLabs não devolveu a conversa');
  }

  const corpo = (await resposta.json()) as PayloadElevenLabs;

  if (!corpo?.conversation_id) {
    return undefined;
  }

  return corpo;
}

async function payloadComTranscricao(
  payload: PayloadElevenLabs,
  input: {
    apiKey: string;
    baseUrl: string;
    fetchImpl?: typeof fetch;
  }
) {
  if (payload.transcript) {
    return payload;
  }

  try {
    const detalhe = await buscarConversaElevenLabs({
      ...input,
      id: payload.conversation_id
    });
    return detalhe ? { ...payload, ...detalhe } : payload;
  } catch {
    return payload;
  }
}

export async function coletarAtendimentosElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<AtendimentoColetado[]> {
  const conversas = await listarConversasElevenLabs(input);
  const coletados: AtendimentoColetado[] = [];

  for (const item of conversas) {
    const payload = await payloadComTranscricao(item, input);
    const atendimento = atendimentoDaFonteElevenLabs(payload);

    if (!atendimento) {
      continue;
    }

    if (!payload.has_audio) {
      coletados.push(atendimento);
      continue;
    }

    try {
      const midia = await baixarAudio(
        input.fetchImpl ?? fetch,
        input.baseUrl,
        input.apiKey,
        payload.conversation_id
      );

      if (!midia) {
        coletados.push(atendimento);
        continue;
      }

      const caminho = caminhoDaMidia(atendimento.id);
      coletados.push({
        ...atendimento,
        ...camposDeMidia(caminho),
        midia: midia.conteudo,
        tipoDaMidia: midia.tipo
      });
    } catch {
      coletados.push(atendimento);
    }
  }

  return coletados;
}
