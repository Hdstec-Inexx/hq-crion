import {
  loginRequestSchema,
  loginResponseSchema,
  perfilSchema,
  type Perfil
} from '@hq-crion/contracts/perfil';
import { gravarSessao, limparSessao, lerSessao } from './sessao';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function autorizacao(sessao: string) {
  return { Authorization: `Bearer ${sessao}` };
}

export async function entrar(email: string, senha: string) {
  const payload = loginRequestSchema.parse({ email, senha });
  const response = await fetch(`${apiUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('login-invalido');
  }

  const body = loginResponseSchema.parse(await response.json());
  gravarSessao(body.sessao);
  return body.perfil;
}

export async function buscarPerfil(
  sessao: string,
  signal?: AbortSignal
): Promise<Perfil | null> {
  const response = await fetch(`${apiUrl}/perfil`, {
    signal,
    headers: {
      ...autorizacao(sessao),
      'Cache-Control': 'no-store'
    }
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('perfil-indisponivel');
  }

  return perfilSchema.parse(await response.json());
}

export async function encerrarSessao() {
  const sessao = lerSessao();

  try {
    if (sessao) {
      await fetch(`${apiUrl}/sair`, {
        method: 'POST',
        headers: {
          ...autorizacao(sessao),
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
    }
  } finally {
    limparSessao();
  }
}
