export function normalizarMotivo(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function filtrarMotivosDeContato(opcoes: readonly string[], busca: string) {
  const termo = normalizarMotivo(busca.trim());

  if (!termo) {
    return [...opcoes];
  }

  return opcoes.filter((opcao) => normalizarMotivo(opcao).includes(termo));
}

export function motivoAceitoNoFiltro(valor: string, opcoes: readonly string[]) {
  const normalizado = normalizarMotivo(valor.trim());

  if (!normalizado) {
    return '';
  }

  return opcoes.find((opcao) => normalizarMotivo(opcao) === normalizado) ?? '';
}
