export const intervaloDoPulsoMs = 10_000;

export function devePulsar(entrada: { visivel: boolean; msDesdeUltimaBusca: number }) {
  return entrada.visivel && entrada.msDesdeUltimaBusca >= intervaloDoPulsoMs;
}

export function esperaDoPulso(ultimaBusca: number, agora: number) {
  if (ultimaBusca <= 0) {
    return intervaloDoPulsoMs;
  }

  return Math.max(0, intervaloDoPulsoMs - (agora - ultimaBusca));
}

export function aplicarCargaDaLista<T>(entrada: {
  listaAtual: T | null;
  carga: { ok: true; lista: T } | { ok: false };
}): { lista: T | null; erro: boolean } {
  if (entrada.carga.ok) {
    return { lista: entrada.carga.lista, erro: false };
  }

  if (entrada.listaAtual !== null) {
    return { lista: entrada.listaAtual, erro: false };
  }

  return { lista: null, erro: true };
}

export function mensagemDaListaAoVivo(entrada: {
  fonteConfigurada: boolean;
  itens: readonly unknown[];
}) {
  if (!entrada.fonteConfigurada) {
    return 'A fonte não está configurada.';
  }

  if (entrada.itens.length === 0) {
    return 'Nenhum Atendimento aberto neste Recorte.';
  }

  return null;
}
