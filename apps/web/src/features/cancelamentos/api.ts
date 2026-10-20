import {
  painelDeCancelamentosResponseSchema,
  type PainelDeCancelamentosResponse,
  pesquisaIaCancelamentoRequestSchema,
  pesquisaIaCancelamentoResponseSchema,
  type PesquisaIaCancelamentoRequest,
  type PesquisaIaCancelamentoResponse,
  analisarPassivoRequestSchema,
  analisarPassivoResponseSchema,
  type AnalisarPassivoRequest,
  type AnalisarPassivoResponse
} from '@hq-crion/contracts/cancelamento';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

function queryDoPainel(query: URLSearchParams) {
  const limpa = new URLSearchParams();

  for (const [chave, valor] of query.entries()) {
    const limpo = valor.trim();
    if (limpo) {
      limpa.set(chave, limpo);
    }
  }

  return limpa;
}

export async function buscarPainelDeCancelamentos(
  searchParams: URLSearchParams,
  signal?: AbortSignal
): Promise<PainelDeCancelamentosResponse | null> {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const queryLimpa = queryDoPainel(searchParams);
  const queryString = queryLimpa.toString();
  const url = `${apiUrl}/api/cancelamentos${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (response.status === 403) {
    throw new Error('cancelamentos-negado');
  }

  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(body?.erro === 'periodo' ? 'periodo-invalido' : 'recorte-invalido');
  }

  if (!response.ok) {
    throw new Error('cancelamentos-indisponivel');
  }

  return painelDeCancelamentosResponseSchema.parse(await response.json());
}

export async function pesquisarCancelamentosComIa(
  payload: PesquisaIaCancelamentoRequest,
  signal?: AbortSignal
): Promise<PesquisaIaCancelamentoResponse> {
  const sessao = lerSessao();

  if (!sessao) {
    throw new Error('sessao-expirada');
  }

  const validado = pesquisaIaCancelamentoRequestSchema.parse(payload);

  const response = await fetch(`${apiUrl}/api/cancelamentos/pesquisa-ia`, {
    method: 'POST',
    signal,
    headers: {
      ...autorizacao(sessao),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(validado)
  });

  if (response.status === 401) {
    throw new Error('sessao-expirada');
  }

  if (response.status === 403) {
    throw new Error('pesquisa-negada');
  }

  if (!response.ok) {
    throw new Error('pesquisa-indisponivel');
  }

  return pesquisaIaCancelamentoResponseSchema.parse(await response.json());
}

export async function analisarPassivoDeCancelamentos(
  payload?: AnalisarPassivoRequest,
  signal?: AbortSignal
): Promise<AnalisarPassivoResponse> {
  const sessao = lerSessao();

  if (!sessao) {
    throw new Error('sessao-expirada');
  }

  const validado = analisarPassivoRequestSchema.parse(payload ?? {});

  const response = await fetch(`${apiUrl}/api/cancelamentos/analisar-passivo`, {
    method: 'POST',
    signal,
    headers: {
      ...autorizacao(sessao),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(validado)
  });

  if (response.status === 401) {
    throw new Error('sessao-expirada');
  }

  if (response.status === 403) {
    throw new Error('analisar-passivo-negado');
  }

  if (!response.ok) {
    throw new Error('analisar-passivo-indisponivel');
  }

  return analisarPassivoResponseSchema.parse(await response.json());
}
