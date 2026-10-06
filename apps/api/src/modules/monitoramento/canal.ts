import {
  eventoDaObservacaoSchema,
  maximoDoTextoDaFala,
  sessaoDaObservacaoSchema,
  type EventoDaObservacao
} from '@hq-crion/contracts/atendimento';
import {
  chamadaRecusada,
  detalheDaChamada,
  nomeDaFerramenta,
  resultadoDaFonte,
  type ItemDaFonte
} from '../ferramenta/da-fonte.js';

export const maximoDaMensagemDaFonte = 64_000;

type FerramentaDaMensagem = ItemDaFonte;

type MensagemDaFonte = {
  type?: string;
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
  agent_tool_request?: FerramentaDaMensagem;
  client_tool_call?: FerramentaDaMensagem;
  agent_tool_response?: FerramentaDaMensagem;
  agent_tool_response_full_payload?: FerramentaDaMensagem;
  mcp_tool_call?: FerramentaDaMensagem & { state?: string };
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

function eventoDeFerramenta(mensagem: MensagemDaFonte): EventoDaObservacao | undefined {
  if (mensagem.type === 'agent_tool_request' || mensagem.type === 'client_tool_call') {
    const ferramenta =
      mensagem.type === 'agent_tool_request' ? mensagem.agent_tool_request : mensagem.client_tool_call;
    const detalhe = ferramenta ? detalheDaChamada(ferramenta) : undefined;

    if (!detalhe || !nomeDaFerramenta(ferramenta ?? {}) || chamadaRecusada(ferramenta ?? {})) {
      return undefined;
    }

    return { tipo: 'chamada', detalhe };
  }

  if (
    mensagem.type === 'agent_tool_response' ||
    mensagem.type === 'agent_tool_response_full_payload'
  ) {
    const ferramenta =
      mensagem.type === 'agent_tool_response'
        ? mensagem.agent_tool_response
        : mensagem.agent_tool_response_full_payload;
    const resultado = ferramenta ? resultadoDaFonte(ferramenta) : undefined;

    if (!resultado) {
      return undefined;
    }

    return { tipo: 'resultado', resultado };
  }

  if (mensagem.type === 'mcp_tool_call') {
    const ferramenta = mensagem.mcp_tool_call;

    if (!ferramenta || !nomeDaFerramenta(ferramenta)) {
      return undefined;
    }

    if (ferramenta.state === 'loading' || ferramenta.state === 'awaiting_approval') {
      const detalhe = detalheDaChamada(ferramenta);
      return detalhe ? { tipo: 'chamada', detalhe } : undefined;
    }

    const resultado = resultadoDaFonte({
      ...ferramenta,
      is_error: ferramenta.state === 'failure',
      tool_has_been_called: true
    });

    return resultado ? { tipo: 'resultado', resultado } : undefined;
  }

  return undefined;
}

export function eventoDaMensagemDaFonte(bruto: unknown): EventoDaObservacao | undefined {
  if (!bruto || typeof bruto !== 'object') {
    return undefined;
  }

  const mensagem = bruto as MensagemDaFonte;
  const ferramenta = eventoDeFerramenta(mensagem);
  const candidato = ferramenta
    ? ferramenta
    :
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

  if (!candidato) {
    return undefined;
  }

  if ((candidato.tipo === 'fala' || candidato.tipo === 'correcao') && !candidato.texto) {
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
