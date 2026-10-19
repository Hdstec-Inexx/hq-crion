export type PageItem = number | 'ellipsis';

/**
 * Gera lista de páginas com números e 'ellipsis' conforme especificação GEAP.
 * - Exibe todas as páginas quando totalPages <= 7.
 * - Quando totalPages > 7, usa janela deslizante com elipses:
 *   - Janela inicial (current <= 4): [1, 2, 3, 4, 5, 'ellipsis', totalPages]
 *   - Janela final (current >= totalPages - 3): [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
 *   - Janela intermediária: [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', totalPages]
 */
export function compactPageItems(
  current: number,
  totalPages: number
): PageItem[] {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const safeCurrent = Math.max(1, Math.min(current, totalPages));

  if (safeCurrent <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (safeCurrent >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    'ellipsis',
    safeCurrent - 1,
    safeCurrent,
    safeCurrent + 1,
    'ellipsis',
    totalPages,
  ];
}
