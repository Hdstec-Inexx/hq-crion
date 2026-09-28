export const intervaloDoPulsoMs = 10_000;

export function devePulsar(entrada: { visivel: boolean; msDesdeUltimaBusca: number }) {
  return entrada.visivel && entrada.msDesdeUltimaBusca >= intervaloDoPulsoMs;
}

export function deveBuscarDeNovo(entrada: {
  visivel: boolean;
  emCurso: boolean;
  ultimaBusca: number | null;
  agora: number;
}) {
  if (!entrada.visivel || entrada.emCurso) {
    return false;
  }

  if (entrada.ultimaBusca === null) {
    return true;
  }

  return entrada.agora - entrada.ultimaBusca >= intervaloDoPulsoMs;
}

export function esperaDoPulso(ultimaBusca: number | null, agora: number) {
  if (ultimaBusca === null || ultimaBusca <= 0) {
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
