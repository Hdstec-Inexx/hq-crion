import {
  eventoDaObservacaoSchema,
  maximoDoTextoDaFala,
  sessaoDaObservacaoSchema,
  textoDaChamadaDeFerramenta,
  textoDoResultadoDaFerramenta,
  type EventoDaObservacao
} from '@hq-crion/contracts/atendimento';

export const maximoDaMensagemDaFonte = 64_000;

type FerramentaDaMensagem = {
  tool_name?: string;
  is_error?: boolean;
  is_called?: boolean;
  status?: string;
};

type MensagemDaFonte = {
  type?: string;
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
  agent_tool_request?: FerramentaDaMensagem;
  client_tool_call?: FerramentaDaMensagem;
  agent_tool_response?: FerramentaDaMensagem;
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

function nomeDaFerramentaDaMensagem(valor: FerramentaDaMensagem | undefined) {
  const nome = valor?.tool_name?.trim();
  return nome ? nome : undefined;
}

function chamadaNaoExecutada(valor: FerramentaDaMensagem) {
  return valor.is_called === false || valor.status === 'skipped';
}

function resultadoFalhou(valor: FerramentaDaMensagem) {
  return (
    valor.is_error === true ||
    valor.status === 'error' ||
    valor.status === 'failure' ||
    valor.status === 'Falha' ||
    valor.status === 'blocked'
  );
}

function falaDeFerramenta(mensagem: MensagemDaFonte) {
  if (mensagem.type === 'agent_tool_request' || mensagem.type === 'client_tool_call') {
    const ferramenta =
      mensagem.type === 'agent_tool_request' ? mensagem.agent_tool_request : mensagem.client_tool_call;
    const nome = nomeDaFerramentaDaMensagem(ferramenta);
    if (!ferramenta || !nome || chamadaNaoExecutada(ferramenta)) {
      return undefined;
    }
    return textoDaChamadaDeFerramenta(nome);
  }

  if (mensagem.type === 'agent_tool_response') {
    const ferramenta = mensagem.agent_tool_response;
    const nome = nomeDaFerramentaDaMensagem(ferramenta);
    if (!ferramenta || !nome || chamadaNaoExecutada(ferramenta)) {
      return undefined;
    }
    return textoDoResultadoDaFerramenta(nome, resultadoFalhou(ferramenta));
  }

  return undefined;
}

export function eventoDaMensagemDaFonte(bruto: unknown): EventoDaObservacao | undefined {
  if (!bruto || typeof bruto !== 'object') {
    return undefined;
  }

  const mensagem = bruto as MensagemDaFonte;
  const ferramenta = falaDeFerramenta(mensagem);
  const candidato = ferramenta
    ? { tipo: 'fala' as const, locutor: 'Agente de Voz' as const, texto: textoDaFala(ferramenta) }
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
