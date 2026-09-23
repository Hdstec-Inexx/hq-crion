import type { Perfil } from '@hq-crion/contracts/perfil';
import { buscarPorId, perfilDaSessao } from './repositorio.js';

type SessaoAberta = {
  perfilId: string;
  versao: number;
};

const sessoes = new Map<string, SessaoAberta>();

export function tokenDaAutorizacao(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

export function registrarSessao(token: string, perfilId: string, versao: number) {
  sessoes.set(token, { perfilId, versao });
}

export function invalidarSessao(token: string) {
  sessoes.delete(token);
}

export function registroDaAutorizacao(authorization: string | undefined) {
  const token = tokenDaAutorizacao(authorization);

  if (!token) {
    return undefined;
  }

  const sessao = sessoes.get(token);

  if (!sessao) {
    return undefined;
  }

  const registro = buscarPorId(sessao.perfilId);

  if (!registro?.ativo || registro.versao !== sessao.versao) {
    sessoes.delete(token);
    return undefined;
  }

  return registro;
}

export function invalidarSessoesDoPerfil(perfilId: string) {
  for (const [token, sessao] of sessoes) {
    if (sessao.perfilId === perfilId) {
      sessoes.delete(token);
    }
  }
}

export function perfilDaAutorizacao(
  authorization: string | undefined
): Perfil | undefined {
  const registro = registroDaAutorizacao(authorization);
  return registro ? perfilDaSessao(registro) : undefined;
}
