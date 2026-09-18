export function rotuloDosCriteriosSelecionados(
  selecionados: string[],
  placeholder = 'Todos os critérios'
) {
  if (selecionados.length === 0) {
    return placeholder;
  }

  if (selecionados.length === 1) {
    return selecionados[0] ?? placeholder;
  }

  return `${selecionados.length} selecionados`;
}

export function criteriosDaQuery(submetido: string) {
  return submetido
    .split(',')
    .map((nome) => nome.trim())
    .filter(Boolean);
}
