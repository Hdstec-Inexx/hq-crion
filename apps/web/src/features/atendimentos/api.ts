import {
  atendimentoDetalheSchema,
  caminhoDeMidiaPermitido,
  comentarioDaFilaSchema,
  filaDeManutencaoResponseSchema,
  percursoDaFilaDeManutencaoSchema,
  listagemResponseSchema,
  type ConferenciaRequest
} from '@hq-crion/contracts/atendimento';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

async function erroDeRecusa(response: Response) {
  const body = (await response.json().catch(() => null)) as { erro?: string } | null;
  return body?.erro === 'periodo' ? 'periodo-invalido' : 'recorte-invalido';
}

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
    throw new Error(await erroDeRecusa(response));
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
    throw new Error(await erroDeRecusa(response));
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

export async function buscarPercursoDaFila(
  atendimentoId: string,
  query: URLSearchParams,
  signal?: AbortSignal
) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const params = queryDaListagem(query);
  params.set('atendimento', atendimentoId);
  const response = await fetch(`${apiUrl}/manutencao/proximo?${params.toString()}`, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('percurso-indisponivel');
  }

  return percursoDaFilaDeManutencaoSchema.parse(await response.json());
}

export async function buscarObjetoDaMidia(caminho: string, signal?: AbortSignal) {
  const sessao = lerSessao();

  if (!sessao || !caminhoDeMidiaPermitido(caminho)) {
    return null;
  }

  const ehUrlExterna = /^https?:\/\//i.test(caminho);
  const urlFinal = ehUrlExterna ? caminho : `${apiUrl}${caminho}`;

  const response = await fetch(urlFinal, {
    signal,
    headers: {
      ...(ehUrlExterna ? {} : autorizacao(sessao)),
      'Cache-Control': 'no-store'
    }
  });

  if (!response.ok) {
    return null;
  }

  return URL.createObjectURL(await response.blob());
}

async function mutarFavorito(id: string, method: 'POST' | 'DELETE') {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/atendimentos/${encodeURIComponent(id)}/favorito`, {
    method,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(method === 'POST' ? 'erro-ao-favoritar' : 'erro-ao-desfavoritar');
  }

  return ((await response.json()) as { favoritadoPeloUsuario: boolean }).favoritadoPeloUsuario;
}

export async function favoritarAtendimento(id: string) {
  return mutarFavorito(id, 'POST');
}

export async function desfavoritarAtendimento(id: string) {
  return mutarFavorito(id, 'DELETE');
}
