const tamanhoDaPagina = 50 as const;

export function paginaDaLista(total: number, paginaBruta: string | undefined) {
  const tamanho = tamanhoDaPagina;
  const ultimaPagina = Math.max(1, Math.ceil(total / tamanho));
  const pagina = Math.min(
    ultimaPagina,
    Math.max(1, Number.parseInt(paginaBruta ?? '1', 10) || 1)
  );
  const inicio = (pagina - 1) * tamanho;

  return { pagina, tamanho, total, inicio, fim: inicio + tamanho };
}
