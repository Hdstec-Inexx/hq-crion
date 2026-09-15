import {
  listaDePerfisSchema,
  perfilComIdSchema,
  perfilSchema,
  type ListaDePerfis,
  type Perfil,
  type PerfilComId
} from '@hq-crion/contracts/perfil';
import { autorizacao } from '../auth/api';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type ResultadoDaAdministracao =
  | { ok: true; perfil: PerfilComId }
  | { ok: false; motivo: 'negado' | 'invalido' | 'conflito' | 'indisponivel' };

async function pedir(
  sessao: string,
  caminho: string,
  init: RequestInit,
  signal?: AbortSignal
) {
  return fetch(`${apiUrl}${caminho}`, {
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

export async function listarPerfis(
  sessao: string,
  signal?: AbortSignal
): Promise<ListaDePerfis | null | 'negado'> {
  const response = await pedir(sessao, '/perfis', { method: 'GET' }, signal);

  if (response.status === 401) {
    return null;
  }

  if (response.status === 403) {
    return 'negado';
  }

  if (!response.ok) {
    throw new Error('perfis-indisponiveis');
  }

  return listaDePerfisSchema.parse(await response.json());
}

export async function criarPerfil(
  sessao: string,
  identidade: Perfil
): Promise<ResultadoDaAdministracao> {
  const parsed = perfilSchema.safeParse(identidade);

  if (!parsed.success) {
    return { ok: false, motivo: 'invalido' };
  }

  const response = await pedir(sessao, '/perfis', {
    method: 'POST',
    body: JSON.stringify(parsed.data)
  });

  if (response.status === 403) {
    return { ok: false, motivo: 'negado' };
  }

  if (response.status === 400) {
    return { ok: false, motivo: 'invalido' };
  }

  if (response.status === 409) {
    return { ok: false, motivo: 'conflito' };
  }

  if (!response.ok) {
    return { ok: false, motivo: 'indisponivel' };
  }

  return {
    ok: true,
    perfil: perfilComIdSchema.parse(await response.json())
  };
}

export async function alterarPerfil(
  sessao: string,
  id: string,
  identidade: Perfil
): Promise<ResultadoDaAdministracao> {
  const parsed = perfilSchema.safeParse(identidade);

  if (!parsed.success) {
    return { ok: false, motivo: 'invalido' };
  }

  const response = await pedir(sessao, `/perfis/${id}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data)
  });

  if (response.status === 403) {
    return { ok: false, motivo: 'negado' };
  }

  if (response.status === 400) {
    return { ok: false, motivo: 'invalido' };
  }

  if (response.status === 409) {
    return { ok: false, motivo: 'conflito' };
  }

  if (!response.ok) {
    return { ok: false, motivo: 'indisponivel' };
  }

  return {
    ok: true,
    perfil: perfilComIdSchema.parse(await response.json())
  };
}
