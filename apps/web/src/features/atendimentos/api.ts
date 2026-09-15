import { atendimentoDetalheSchema, listagemResponseSchema } from '@hq-crion/contracts/atendimento';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function buscarAtendimentos(
  query: URLSearchParams,
  signal?: AbortSignal
) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/atendimentos?${query.toString()}`, {
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
