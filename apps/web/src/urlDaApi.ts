const apiLocal = 'http://localhost:3000';

export function urlDaApi() {
  const definida = import.meta.env.VITE_API_URL?.trim();

  if (definida) {
    return definida.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return apiLocal;
  }

  throw new Error(
    'VITE_API_URL é obrigatório no build de produção; o browser não pode cair em localhost.'
  );
}
