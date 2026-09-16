import { dashboardResponseSchema, type DashboardResponse } from '@hq-crion/contracts/dashboard';
import { autorizacao } from '../auth/api';
import { lerSessao } from '../auth/sessao';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function queryDoDashboard(query: URLSearchParams) {
  const limpa = new URLSearchParams();

  for (const chave of ['administradora', 'agente', 'inicio', 'fim'] as const) {
    const valor = query.get(chave)?.trim();

    if (valor) {
      limpa.set(chave, valor);
    }
  }

  return limpa;
}

export async function buscarDashboard(query: URLSearchParams, signal?: AbortSignal) {
  const sessao = lerSessao();

  if (!sessao) {
    return null;
  }

  const response = await fetch(`${apiUrl}/dashboard?${queryDoDashboard(query).toString()}`, {
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
    throw new Error('dashboard-negado');
  }

  if (response.status === 400) {
    throw new Error('recorte-invalido');
  }

  if (!response.ok) {
    throw new Error('dashboard-indisponivel');
  }

  return dashboardResponseSchema.parse(await response.json());
}

export type { DashboardResponse };
