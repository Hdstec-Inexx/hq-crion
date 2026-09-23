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
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  transcript?: { role: string; message: string; time_in_call_secs?: number }[];
};

function locutorDe(role: string): 'Agente de Voz' | 'Cliente' {
  return role === 'user' || role === 'cliente' ? 'Cliente' : 'Agente de Voz';
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
    audio: `/media/${payload.conversation_id}.wav`,
    downloadDeAudio: `/media/${payload.conversation_id}.wav`,
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

export async function coletarAtendimentosElevenLabs(input: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const resposta = await fetchImpl(`${input.baseUrl}/v1/convai/conversations`, {
      headers: { 'xi-api-key': input.apiKey },
      signal: controller.signal
    });

    if (!resposta.ok) {
      throw new Error(`ElevenLabs respondeu ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as ListaElevenLabs;
    return (corpo.conversations ?? [])
      .map(atendimentoDaFonteElevenLabs)
      .filter((item): item is RegistroDeAtendimento => item !== undefined);
  } finally {
    clearTimeout(timeout);
  }
}
