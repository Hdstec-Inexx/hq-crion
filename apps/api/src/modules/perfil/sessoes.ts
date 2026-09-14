import type { Perfil } from '@hq-crion/contracts/perfil';

export const sessoes = new Map<string, Perfil>();

export function tokenDaAutorizacao(authorization: string | undefined) {
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
}

export function perfilDaAutorizacao(authorization: string | undefined) {
  const token = tokenDaAutorizacao(authorization);
  return token ? sessoes.get(token) : undefined;
}
