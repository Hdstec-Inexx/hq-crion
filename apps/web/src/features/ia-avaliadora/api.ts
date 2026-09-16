import {
  configuracaoDaIaAvaliadoraSchema,
  type ConfiguracaoDaIaAvaliadora
} from '@hq-crion/contracts/ia-avaliadora';
import { autorizacao } from '../auth/api';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type ResultadoDaIaAvaliadora =
  | { ok: true; configuracao: ConfiguracaoDaIaAvaliadora }
  | { ok: false; motivo: 'sessao' | 'negado' | 'invalido' | 'indisponivel' };

async function pedir(
  sessao: string,
  init: RequestInit,
  signal?: AbortSignal
) {
  return fetch(`${apiUrl}/ia-avaliadora`, {
    ...init,
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
}

export async function buscarIaAvaliadora(
  sessao: string,
  signal?: AbortSignal
): Promise<ConfiguracaoDaIaAvaliadora | null | 'negado'> {
  const response = await pedir(sessao, { method: 'GET' }, signal);

  if (response.status === 401) {
    return null;
  }

  if (response.status === 403) {
    return 'negado';
  }

  if (!response.ok) {
    throw new Error('ia-avaliadora-indisponivel');
  }

  return configuracaoDaIaAvaliadoraSchema.parse(await response.json());
}

export async function gravarIaAvaliadora(
  sessao: string,
  configuracao: ConfiguracaoDaIaAvaliadora
): Promise<ResultadoDaIaAvaliadora> {
  const parsed = configuracaoDaIaAvaliadoraSchema.safeParse(configuracao);

  if (!parsed.success) {
    return { ok: false, motivo: 'invalido' };
  }

  const response = await pedir(sessao, {
    method: 'PUT',
    body: JSON.stringify(parsed.data)
  });

  if (response.status === 401) {
    return { ok: false, motivo: 'sessao' };
  }

  if (response.status === 403) {
    return { ok: false, motivo: 'negado' };
  }

  if (response.status === 400) {
    return { ok: false, motivo: 'invalido' };
  }

  if (!response.ok) {
    return { ok: false, motivo: 'indisponivel' };
  }

  return {
    ok: true,
    configuracao: configuracaoDaIaAvaliadoraSchema.parse(await response.json())
  };
}
