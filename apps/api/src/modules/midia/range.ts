export type ResultadoRange =
  | { tipo: 'intervalo'; inicio: number; fim: number }
  | { tipo: 'insatisfativel' }
  | { tipo: 'invalido' };

export function extrairIntervaloDeBytes(
  rangeHeader: string | undefined,
  total: number
): ResultadoRange {
  if (!rangeHeader || typeof rangeHeader !== 'string') {
    return { tipo: 'invalido' };
  }

  const match = rangeHeader.trim().match(/^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/i);
  if (!match) {
    return { tipo: 'invalido' };
  }

  const startStr = match[1];
  const endStr = match[2];

  if (startStr === '' && endStr === '') {
    return { tipo: 'invalido' };
  }

  if (total <= 0) {
    return { tipo: 'insatisfativel' };
  }

  let inicio: number;
  let fim: number;

  if (startStr !== '') {
    inicio = Number(startStr);
    if (inicio >= total) {
      return { tipo: 'insatisfativel' };
    }

    if (endStr !== '') {
      fim = Number(endStr);
      if (inicio > fim) {
        return { tipo: 'insatisfativel' };
      }
    } else {
      fim = total - 1;
    }
  } else if (endStr !== '') {
    const sufixo = Number(endStr);
    if (sufixo <= 0) {
      return { tipo: 'insatisfativel' };
    }
    inicio = Math.max(0, total - sufixo);
    fim = total - 1;
  } else {
    return { tipo: 'invalido' };
  }

  if (fim >= total) {
    fim = total - 1;
  }

  return { tipo: 'intervalo', inicio, fim };
}
