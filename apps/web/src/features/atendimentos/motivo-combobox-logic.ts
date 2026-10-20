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

export function pontuacaoDeAcentos(texto: string): number {
  if (!texto || typeof texto !== 'string') {
    return 0;
  }
  const acentuados = texto.match(/[áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ]/g);
  return acentuados ? acentuados.length : 0;
}

export function desduplicarMotivos(opcoes: readonly string[] = []): string[] {
  const mapa = new Map<string, string>();
  const ordemDasChaves: string[] = [];

  for (const opcao of opcoes) {
    if (!opcao || typeof opcao !== 'string') continue;
    const trimmed = opcao.trim();
    if (!trimmed) continue;
    const chave = normalizarMotivo(trimmed);
    const atual = mapa.get(chave);

    if (!atual) {
      mapa.set(chave, trimmed);
      ordemDasChaves.push(chave);
    } else {
      const scoreAtual = pontuacaoDeAcentos(atual);
      const scoreNovo = pontuacaoDeAcentos(trimmed);
      if (
        scoreNovo > scoreAtual ||
        (scoreNovo === scoreAtual && trimmed.length > atual.length) ||
        (scoreNovo === scoreAtual &&
          trimmed.length === atual.length &&
          trimmed.localeCompare(atual) > 0)
      ) {
        mapa.set(chave, trimmed);
      }
    }
  }

  return ordemDasChaves.map((chave) => mapa.get(chave)!);
}

export function filtrarMotivosDeContato(
  opcoes: readonly string[] = [],
  busca: string = ''
) {
  const opcoesUnicas = desduplicarMotivos(opcoes);
  const termo = normalizarMotivo(busca);

  if (!termo) {
    return opcoesUnicas;
  }

  const tokens = termo.split(' ').filter(Boolean);

  return opcoesUnicas.filter((opcao) => {
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

  const opcoesUnicas = desduplicarMotivos(opcoes);
  const exato = opcoesUnicas.find((opcao) => opcao === trimmed);
  if (exato) {
    return exato;
  }

  const normalizado = normalizarMotivo(trimmed);
  if (!normalizado) {
    return '';
  }

  return opcoesUnicas.find((opcao) => normalizarMotivo(opcao) === normalizado) ?? '';
}
