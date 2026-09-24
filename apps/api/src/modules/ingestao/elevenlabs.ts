import { agentesDeVoz } from '@hq-crion/contracts/recorte';
import type { RegistroDeAtendimento } from '../atendimentos/registro.js';
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
  const transcricao = (payload.transcript ?? []).map((turno, index) => {
    const comTempo = typeof turno.time_in_call_secs === 'number';

    return {
      locutor: locutorDe(turno.role),
      quando: comTempo ? quandoDaFonte(turno.time_in_call_secs as number) : quandoDaFonte(index),
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
};

function urlDaFonte(baseUrl: string, caminho: string) {
  return `${baseUrl.replace(/\/$/, '')}${caminho}`;
}

async function buscarJson(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const resposta = await fetchImpl(url, {
      headers: { 'xi-api-key': apiKey },
      signal: controller.signal
    });

    if (!resposta.ok) {
      return undefined;
    }

    return (await resposta.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function baixarAudio(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  id: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const resposta = await fetchImpl(
      urlDaFonte(baseUrl, `/v1/convai/conversations/${encodeURIComponent(id)}/audio`),
      {
        headers: { 'xi-api-key': apiKey },
        signal: controller.signal
      }
    );
    const tipo = resposta.headers.get('content-type') ?? '';

    if (!resposta.ok || tipo.includes('json') || !tipo.includes('audio')) {
      return undefined;
    }

    const midia = Buffer.from(await resposta.arrayBuffer());
    return midia.byteLength > 0 ? midia : undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listarConversasElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const corpo = (await buscarJson(
    fetchImpl,
    urlDaFonte(input.baseUrl, '/v1/convai/conversations'),
    input.apiKey
  )) as ListaElevenLabs | undefined;

  if (!corpo) {
    throw new Error('ElevenLabs não listou as conversas');
  }

  return corpo.conversations ?? [];
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

export async function coletarAtendimentosElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<AtendimentoColetado[]> {
  const conversas = await listarConversasElevenLabs(input);
  const coletados: AtendimentoColetado[] = [];

  for (const payload of conversas) {
    const atendimento = atendimentoDaFonteElevenLabs(payload);

    if (!atendimento) {
      continue;
    }

    if (!payload.has_audio) {
      coletados.push(atendimento);
      continue;
    }

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
      audio: caminho,
      downloadDeAudio: caminho,
      midia
    });
  }

  return coletados;
}
