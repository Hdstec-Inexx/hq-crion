const apiLocal = 'http://localhost:3000';

export function urlDaApi() {
  const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
  const definida = (typeof env?.VITE_API_URL === 'string' ? env.VITE_API_URL : undefined)?.trim();

  if (definida) {
    return definida.replace(/\/$/, '');
  }

  if (env?.DEV || !env) {
    return apiLocal;
  }

  throw new Error(
    'VITE_API_URL é obrigatório no build de produção; o browser não pode cair em localhost.'
  );
}
