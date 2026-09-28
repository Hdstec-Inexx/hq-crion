import {
  eventoDaObservacaoSchema,
  maximoDoTextoDaFala,
  sessaoDaObservacaoSchema,
  type EventoDaObservacao
} from '@hq-crion/contracts/atendimento';

export const maximoDaMensagemDaFonte = 64_000;

type MensagemDaFonte = {
  type?: string;
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
};

type SocketDeEvento = {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
};

export function enviarEvento(socket: SocketDeEvento, evento: EventoDaObservacao) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(evento));
  }
}

export function urlDoMonitorDaFonte(baseUrl: string, id: string) {
  const base = new URL(baseUrl);
  base.protocol = base.protocol === 'http:' ? 'ws:' : 'wss:';
  base.pathname = `/v1/convai/conversations/${encodeURIComponent(id)}/monitor`;
  base.search = '';
  base.hash = '';
  return base.toString().replace(/\/$/, '');
}

function textoDaFala(valor: unknown) {
  if (typeof valor !== 'string') {
    return undefined;
  }

  const texto = valor.trim();

  if (!texto) {
    return undefined;
  }

  return texto.length > maximoDoTextoDaFala ? texto.slice(0, maximoDoTextoDaFala) : texto;
}

export function eventoDaMensagemDaFonte(bruto: unknown): EventoDaObservacao | undefined {
  if (!bruto || typeof bruto !== 'object') {
    return undefined;
  }

  const mensagem = bruto as MensagemDaFonte;
  const candidato =
    mensagem.type === 'user_transcript'
      ? {
          tipo: 'fala' as const,
          locutor: 'Cliente' as const,
          texto: textoDaFala(mensagem.user_transcription_event?.user_transcript)
        }
      : mensagem.type === 'agent_response'
        ? {
            tipo: 'fala' as const,
            locutor: 'Agente de Voz' as const,
            texto: textoDaFala(mensagem.agent_response_event?.agent_response)
          }
        : mensagem.type === 'agent_response_correction'
          ? {
              tipo: 'correcao' as const,
              texto: textoDaFala(mensagem.agent_response_correction_event?.corrected_agent_response)
            }
          : undefined;

  if (!candidato?.texto) {
    return undefined;
  }

  const evento = eventoDaObservacaoSchema.safeParse(candidato);
  return evento.success ? evento.data : undefined;
}

export function sessaoDaMensagem(bruto: unknown) {
  let corpo = bruto;

  if (typeof bruto === 'string') {
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return undefined;
    }
  }

  const sessao = sessaoDaObservacaoSchema.safeParse(corpo);
  return sessao.success ? sessao.data.sessao : undefined;
}
