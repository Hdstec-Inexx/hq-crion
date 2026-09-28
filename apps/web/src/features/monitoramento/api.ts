import {
  eventoDaObservacaoSchema,
  monitoramentoDetalheSchema
} from '@hq-crion/contracts/atendimento';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';
import { normalizarListagemAoVivo } from './pulso';

const apiUrl = urlDaApi();

function queryDaListagem(query: URLSearchParams) {
  const limpa = new URLSearchParams();

  for (const chave of ['administradora', 'agente'] as const) {
    const valor = query.get(chave);

    if (valor) {
      limpa.set(chave, valor);
    }
  }

  return limpa;
}

export async function buscarMonitoramento(query: URLSearchParams) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(
    `${apiUrl}/monitoramento?${queryDaListagem(query).toString()}`,
    {
      headers: {
        ...autorizacao(sessao),
        'Cache-Control': 'no-store'
      }
    }
  );

  if (response.status === 401) {
    return null;
  }

  if (response.status === 400) {
    throw new Error('recorte-invalido');
  }

  if (!response.ok) {
    throw new Error('listagem-indisponivel');
  }

  const lista = normalizarListagemAoVivo(await response.json());

  if (!lista) {
    throw new Error('listagem-indisponivel');
  }

  return lista;
}

export async function buscarDetalheDoMonitoramento(id: string, signal?: AbortSignal) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/monitoramento/${encodeURIComponent(id)}`, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (response.status === 404) {
    throw new Error('atendimento-nao-encontrado');
  }

  if (!response.ok) {
    throw new Error('detalhe-indisponivel');
  }

  return monitoramentoDetalheSchema.parse(await response.json());
}

export function urlDaObservacao(id: string) {
  const base = new URL(apiUrl);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const prefixo = base.pathname.replace(/\/$/, '');
  base.pathname = `${prefixo}/monitoramento/${encodeURIComponent(id)}/observacao`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export function lerEventoDaObservacao(data: unknown) {
  let corpo = data;

  if (typeof data === 'string') {
    try {
      corpo = JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  const evento = eventoDaObservacaoSchema.safeParse(corpo);
  return evento.success ? evento.data : undefined;
}
