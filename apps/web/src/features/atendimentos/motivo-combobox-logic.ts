export function normalizarMotivo(texto: string) {
  if (!texto || typeof texto !== 'string') {
    return '';
  }

  const seguro = texto.length > 200 ? texto.slice(0, 200) : texto;

  return seguro
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ªº]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function filtrarMotivosDeContato(
  opcoes: readonly string[] = [],
  busca: string = ''
) {
  const termo = normalizarMotivo(busca);

  if (!termo) {
    return [...opcoes];
  }

  const tokens = termo.split(' ').filter(Boolean);

  return opcoes.filter((opcao) => {
    const normalizado = normalizarMotivo(opcao);
    return tokens.every((token) => normalizado.includes(token));
  });
}

export function motivoAceitoNoFiltro(
  valor: string = '',
  opcoes: readonly string[] = []
) {
  if (!valor || typeof valor !== 'string') {
    return '';
  }

  const trimmed = valor.trim();
  if (!trimmed) {
    return '';
  }

  const exato = opcoes.find((opcao) => opcao === trimmed);
  if (exato) {
    return exato;
  }

  const normalizado = normalizarMotivo(trimmed);
  if (!normalizado) {
    return '';
  }

  return opcoes.find((opcao) => normalizarMotivo(opcao) === normalizado) ?? '';
}
