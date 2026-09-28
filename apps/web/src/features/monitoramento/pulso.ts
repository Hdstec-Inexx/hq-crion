import {
  monitoramentoListItemSchema,
  monitoramentoListagemResponseSchema,
  type MonitoramentoListagemResponse
} from '@hq-crion/contracts/atendimento';
import { administradoraSchema, type Administradora } from '@hq-crion/contracts/recorte';

export const intervaloDoPulsoMs = 10_000;

type ItemDaListaAoVivo = MonitoramentoListagemResponse['itens'][number];

export type ErroDaListaAoVivo = 'listagem' | 'recorte-invalido';

export type EstadoDaListaAoVivo<T> = {
  lista: T | null;
  erro: ErroDaListaAoVivo | null;
};

export type CargaDaListaAoVivo<T> =
  | { tipo: 'lista'; lista: T }
  | { tipo: 'falha'; vigente: boolean; abortada: boolean }
  | { tipo: 'recorte-invalido'; vigente: boolean };

function textoPreenchido(valor: unknown) {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : '';
}

function iniciadoEmDoItem(valor: unknown) {
  if (typeof valor === 'string' && valor.trim()) {
    return valor.trim();
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const milissegundos = valor < 1_000_000_000_000 ? valor * 1000 : valor;
    return new Date(milissegundos).toISOString();
  }

  return new Date(0).toISOString();
}

function administradoraDoItem(valor: unknown): Administradora | null {
  const lida = administradoraSchema.safeParse(valor);
  return lida.success ? lida.data : null;
}

function normalizarItem(valor: unknown): ItemDaListaAoVivo | null {
  const estrito = monitoramentoListItemSeguro(valor);

  if (estrito) {
    return estrito;
  }

  if (!valor || typeof valor !== 'object') {
    return null;
  }

  const item = valor as Record<string, unknown>;
  const id = textoPreenchido(item.id);
  const agenteId = textoPreenchido(item.agenteId);

  if (!id || !agenteId) {
    return null;
  }

  const agente = textoPreenchido(item.agente);
  const motivo = textoPreenchido(item.motivo);

  return {
    id,
    administradora: administradoraDoItem(item.administradora),
    agente: agente || agenteId,
    agenteId,
    iniciadoEm: iniciadoEmDoItem(item.iniciadoEm),
    motivo: motivo || 'Não informado',
    status: 'Em andamento'
  };
}

function monitoramentoListItemSeguro(valor: unknown) {
  if (!valor || typeof valor !== 'object') {
    return null;
  }

  const item = valor as Record<string, unknown>;
  const resultado = monitoramentoListItemSchema.safeParse({
    ...item,
    administradora: item.administradora ?? null
  });
  return resultado.success ? resultado.data : null;
}

export function normalizarListagemAoVivo(corpo: unknown): MonitoramentoListagemResponse | null {
  const estrito = monitoramentoListagemResponseSchema.safeParse(corpo);

  if (estrito.success) {
    return estrito.data;
  }

  if (!corpo || typeof corpo !== 'object' || !Array.isArray((corpo as { itens?: unknown }).itens)) {
    return null;
  }

  const bruto = corpo as Record<string, unknown>;
  const itens = bruto.itens instanceof Array ? bruto.itens.flatMap((item) => {
    const linha = normalizarItem(item);
    return linha ? [linha] : [];
  }) : [];
  const recorteBruto =
    bruto.recorte && typeof bruto.recorte === 'object'
      ? (bruto.recorte as Record<string, unknown>)
      : null;
  const pagina =
    typeof bruto.pagina === 'number' && Number.isInteger(bruto.pagina) && bruto.pagina >= 1
      ? bruto.pagina
      : 1;
  const total =
    typeof bruto.total === 'number' && Number.isInteger(bruto.total) && bruto.total >= 0
      ? bruto.total
      : itens.length;

  return {
    recorte: {
      administradora: recorteBruto ? administradoraDoItem(recorteBruto.administradora) : null,
      agente: recorteBruto ? textoPreenchido(recorteBruto.agente) || null : null
    },
    pagina,
    tamanho: 50,
    total,
    itens,
    fonteConfigurada: bruto.fonteConfigurada !== false
  };
}

export function reduzirCargaAoVivo<T>(
  atual: EstadoDaListaAoVivo<T>,
  carga: CargaDaListaAoVivo<T>
): EstadoDaListaAoVivo<T> {
  if (carga.tipo === 'lista') {
    return { lista: carga.lista, erro: null };
  }

  if (!carga.vigente || (carga.tipo === 'falha' && carga.abortada)) {
    return atual;
  }

  if (carga.tipo === 'recorte-invalido') {
    return { lista: null, erro: 'recorte-invalido' };
  }

  if (atual.lista) {
    return { lista: atual.lista, erro: null };
  }

  return { lista: null, erro: 'listagem' };
}

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
