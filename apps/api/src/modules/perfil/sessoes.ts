import type { Perfil } from '@hq-crion/contracts/perfil';

const sessoes = new Map<string, Perfil>();

export function tokenDaAutorizacao(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

export function registrarSessao(token: string, perfil: Perfil) {
  sessoes.set(token, perfil);
}

export function invalidarSessao(token: string) {
  sessoes.delete(token);
}

export function perfilDaAutorizacao(authorization: string | undefined) {
  const token = tokenDaAutorizacao(authorization);
  return token ? sessoes.get(token) : undefined;
}
