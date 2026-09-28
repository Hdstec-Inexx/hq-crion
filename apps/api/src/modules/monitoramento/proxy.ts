import WebSocket, { type RawData, type WebSocket as WsWebSocket } from 'ws';
import { enviarEvento, eventoDaMensagemDaFonte, maximoDaMensagemDaFonte } from './canal.js';

type Conectar = (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string>; maxPayload?: number }
) => WsWebSocket;

type OpcoesDoProxy = {
  client: WsWebSocket;
  apiKey: string;
  monitorUrl: string;
  connect?: Conectar;
};

function textoDaMensagem(data: RawData) {
  if (typeof data === 'string') {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }

  return Buffer.from(data).toString('utf8');
}

export function createMonitoramentoProxy({
  client,
  apiKey,
  monitorUrl,
  connect = (url, _protocols, options) => new WebSocket(url, options)
}: OpcoesDoProxy) {
  let upstream: WsWebSocket;

  try {
    upstream = connect(monitorUrl, undefined, {
      headers: { 'xi-api-key': apiKey },
      maxPayload: maximoDaMensagemDaFonte
    });
  } catch {
    enviarEvento(client, { tipo: 'erro' });
    client.close();
    return;
  }

  let aberto = false;
  let encerrou = false;

  function soltarFonte() {
    if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) {
      upstream.close();
    }
  }

  function fechar() {
    if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
      client.close();
    }

    soltarFonte();
  }

  function falhar() {
    if (encerrou) {
      return;
    }

    encerrou = true;
    enviarEvento(client, { tipo: 'erro' });
    fechar();
  }

  upstream.on('open', () => {
    aberto = true;
    enviarEvento(client, { tipo: 'pronto' });
  });

  upstream.on('message', (data) => {
    const bruto = textoDaMensagem(data);

    if (bruto.length > maximoDaMensagemDaFonte) {
      return;
    }

    let corpo: unknown;

    try {
      corpo = JSON.parse(bruto);
    } catch {
      return;
    }

    const evento = eventoDaMensagemDaFonte(corpo);

    if (evento) {
      enviarEvento(client, evento);
    }
  });

  upstream.on('close', () => {
    if (encerrou) {
      return;
    }

    encerrou = true;
    enviarEvento(client, aberto ? { tipo: 'encerrada' } : { tipo: 'erro' });

    if (client.readyState === client.OPEN) {
      client.close();
    }
  });

  upstream.on('error', falhar);
  upstream.on('unexpected-response', falhar);

  client.on('message', () => undefined);

  client.on('close', () => {
    encerrou = true;
    soltarFonte();
  });

  client.on('error', () => {
    encerrou = true;
    soltarFonte();
  });
}
