export function abortou(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const nome = 'name' in error ? String(error.name) : '';

  if (nome === 'AbortError') {
    return true;
  }

  const mensagem = 'message' in error ? String(error.message) : '';
  return mensagem.toLowerCase().includes('aborted');
}
