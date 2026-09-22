import {
  listaDePerfisSchema,
  perfilComIdSchema,
  perfilSchema,
  ativoDoPerfilSchema,
  motivoUltimoAdmin,
  type ListaDePerfis,
  type Perfil,
  type PerfilComId
} from '@hq-crion/contracts/perfil';
import { autorizacao } from '../auth/api';
import { urlDaApi } from '../../urlDaApi';

const apiUrl = urlDaApi();

export type ResultadoDaAdministracao =
  | { ok: true; perfil: PerfilComId }
  | {
      ok: false;
      motivo:
        | 'negado'
        | 'invalido'
        | 'conflito'
        | typeof motivoUltimoAdmin
        | 'indisponivel';
    };

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

  return lerPerfilAdministrado(response);
}

export async function definirAtivoDoPerfil(
  sessao: string,
  id: string,
  ativo: boolean
): Promise<ResultadoDaAdministracao> {
  const parsed = ativoDoPerfilSchema.safeParse({ ativo });

  if (!parsed.success) {
    return { ok: false, motivo: 'invalido' };
  }

  const response = await pedir(sessao, `/perfis/${id}/ativo`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data)
  });

  return lerPerfilAdministrado(response);
}

async function lerPerfilAdministrado(
  response: Response
): Promise<ResultadoDaAdministracao> {
  if (response.status === 403) {
    return { ok: false, motivo: 'negado' };
  }

  if (response.status === 400) {
    return { ok: false, motivo: 'invalido' };
  }

  if (response.status === 409) {
    const corpo = (await response.json().catch(() => null)) as {
      motivo?: string;
    } | null;

    if (corpo?.motivo === motivoUltimoAdmin) {
      return { ok: false, motivo: motivoUltimoAdmin };
    }

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
