import type { Perfil } from '@hq-crion/contracts/perfil';
import { buscarPorId, perfilDaSessao } from './repositorio.js';

const sessoes = new Map<string, string>();

export function tokenDaAutorizacao(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

export function registrarSessao(token: string, perfilId: string) {
  sessoes.set(token, perfilId);
}

export function invalidarSessao(token: string) {
  sessoes.delete(token);
}

export function registroDaAutorizacao(authorization: string | undefined) {
  const token = tokenDaAutorizacao(authorization);

  if (!token) {
    return undefined;
  }

  const perfilId = sessoes.get(token);

  if (!perfilId) {
    return undefined;
  }

  return buscarPorId(perfilId);
}

export function perfilDaAutorizacao(
  authorization: string | undefined
): Perfil | undefined {
  const registro = registroDaAutorizacao(authorization);
  return registro ? perfilDaSessao(registro) : undefined;
}
