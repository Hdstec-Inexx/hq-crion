import {
  atendimentoDetalheSchema,
  comentarioDaFilaSchema,
  filaDeManutencaoResponseSchema,
  listagemResponseSchema,
  type ConferenciaRequest
} from '@hq-crion/contracts/atendimento';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function queryDaListagem(query: URLSearchParams) {
  const limpa = new URLSearchParams(query);
  limpa.delete('lista');
  return limpa;
}

export async function buscarAtendimentos(
  caminho: string,
  query: URLSearchParams,
  signal?: AbortSignal
) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(
    `${apiUrl}${caminho}?${queryDaListagem(query).toString()}`,
    {
      signal,
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

  return listagemResponseSchema.parse(await response.json());
}

export async function buscarAtendimento(id: string, signal?: AbortSignal) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/atendimentos/${encodeURIComponent(id)}`, {
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

  return atendimentoDetalheSchema.parse(await response.json());
}

export async function gravarConferencia(id: string, conferencia: ConferenciaRequest) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(
    `${apiUrl}/atendimentos/${encodeURIComponent(id)}/conferencia`,
    {
      method: 'POST',
      headers: {
        ...autorizacao(sessao),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(conferencia)
    }
  );

  if (response.status === 401) {
    return null;
  }

  if (response.status === 403) {
    throw new Error('conferencia-negada');
  }

  if (!response.ok) {
    throw new Error('conferencia-indisponivel');
  }

  return atendimentoDetalheSchema.parse(await response.json());
}

export async function buscarFilaDeManutencao(query: URLSearchParams, signal?: AbortSignal) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/manutencao?${queryDaListagem(query).toString()}`, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (response.status === 400) {
    throw new Error('recorte-invalido');
  }

  if (!response.ok) {
    throw new Error('listagem-indisponivel');
  }

  return filaDeManutencaoResponseSchema.parse(await response.json());
}

export async function marcarComentarioResolvido(id: string) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/manutencao/${encodeURIComponent(id)}/resolver`, {
    method: 'POST',
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (response.status === 403) {
    throw new Error('resolucao-negada');
  }

  if (response.status === 409) {
    throw new Error('resolucao-conflito');
  }

  if (!response.ok) {
    throw new Error('resolucao-indisponivel');
  }

  return comentarioDaFilaSchema.parse(await response.json());
}
