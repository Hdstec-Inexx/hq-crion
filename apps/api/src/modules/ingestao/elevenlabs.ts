import { agentesDeVoz } from '@hq-crion/contracts/recorte';
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
  transcript?: { role: string; message: string; time_in_call_secs?: number }[];
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

export function conversaAbertaNaFonte(status: string | undefined) {
  return status === 'in-progress' || status === 'initiated';
}

export function atendimentoDaFonteElevenLabs(
  payload: PayloadElevenLabs
): RegistroDeAtendimento | undefined {
  const agente = agentesDeVoz.find((item) => item.id === payload.agent_id);

  if (!agente) {
    return undefined;
  }

  const iniciadoEm = payload.start_time_unix_secs
    ? new Date(payload.start_time_unix_secs * 1000).toISOString()
    : new Date().toISOString();
  const concluido = payload.status === 'done' || payload.status === 'completed';
  const transcricao = (payload.transcript ?? []).map((turno) => {
    const comTempo = typeof turno.time_in_call_secs === 'number';

    return {
      locutor: locutorDe(turno.role),
        quando: comTempo ? quandoDaFonte(turno.time_in_call_secs as number) : '—',
      texto: turno.message,
      comTempo
    };
  });
  const tempoDeEsperaEmSegundos = tempoDeEsperaDaTranscricao(
    transcricao.map((turno) => ({
      locutor: turno.locutor,
      quando: turno.comTempo ? turno.quando : ''
    }))
  );

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
    transcricao: transcricao.map(({ locutor, quando, texto }) => ({ locutor, quando, texto })),
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
  apiKey: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    return await fetchImpl(url, {
      headers: { 'xi-api-key': apiKey },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function buscarJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string
) {
  const resposta = await respostaDaFonte(fetchImpl, url, apiKey);

  if (!resposta.ok) {
    return undefined;
  }

  return (await resposta.json()) as unknown;
}

async function baixarAudio(
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

  const midia = Buffer.from(await resposta.arrayBuffer());

  if (midia.byteLength === 0 || midia.byteLength > limiteDeMidia) {
    return undefined;
  }

  return { conteudo: midia, tipo };
}

export async function listarConversasElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const conversas: PayloadElevenLabs[] = [];
  let cursor: string | undefined;

  for (let pagina = 0; pagina < limiteDePaginas; pagina += 1) {
    const caminho = cursor
      ? `/v1/convai/conversations?cursor=${encodeURIComponent(cursor)}`
      : '/v1/convai/conversations';
    const corpo = (await buscarJson(
      fetchImpl,
      urlDaFonte(input.baseUrl, caminho),
      input.apiKey
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
  const corpo = (await buscarJson(
    fetchImpl,
    urlDaFonte(input.baseUrl, `/v1/convai/conversations/${encodeURIComponent(input.id)}`),
    input.apiKey
  )) as PayloadElevenLabs | undefined;

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
