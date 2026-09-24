import { z } from 'zod';

export const administradoras = ['Affix', 'Alter', 'Conectaplan'] as const;

export const administradoraSchema = z.enum(administradoras);

export type Administradora = z.infer<typeof administradoraSchema>;

export const recorteSchema = z.object({
  administradora: administradoraSchema.nullable(),
  agente: z.string().nullable()
});

export type Recorte = z.infer<typeof recorteSchema>;

export type AgenteDeVoz = {
  id: string;
  administradora: Administradora;
  nome: string;
};

export const agentesDeVoz: AgenteDeVoz[] = [
  { id: 'affix-0800', administradora: 'Affix', nome: 'Clara Affix 0800' },
  { id: 'affix-wa', administradora: 'Affix', nome: 'Clara Affix WhatsApp' },
  { id: 'alter-1', administradora: 'Alter', nome: 'Clara Alter' },
  { id: 'conecta-1', administradora: 'Conectaplan', nome: 'Clara Conectaplan' }
];

export function queryDoRecorte(recorte: Recorte): URLSearchParams {
  const query = new URLSearchParams();

  if (recorte.administradora) {
    query.set('administradora', recorte.administradora);
  }

  if (recorte.agente) {
    query.set('agente', recorte.agente);
  }

  return query;
}

export function escreverRecorteNaQuery(
  atual: URLSearchParams,
  administradora: string,
  agente: string,
  opcoes?: { resetarPagina?: boolean }
): URLSearchParams {
  const recorteQuery = queryDoRecorte({
    administradora: administradoraSchema.safeParse(administradora).data ?? null,
    agente: administradora && agente ? agente : null
  });
  const proxima = new URLSearchParams(atual);
  proxima.delete('administradora');
  proxima.delete('agente');

  if (opcoes?.resetarPagina) {
    proxima.delete('pagina');
  }

  for (const [chave, valor] of recorteQuery) {
    proxima.set(chave, valor);
  }

  return proxima;
}

export function lerRecorte(query: {
  administradora?: string;
  agente?: string;
}): Recorte {
  const administradoraBruta = query.administradora?.trim() || undefined;
  const agente = query.agente?.trim() || undefined;
  const administradora = administradoraBruta
    ? administradoraSchema.parse(administradoraBruta)
    : null;

  if (agente && !administradora) {
    throw new Error('Recorte inválido');
  }

  if (agente && administradora) {
    const encontrado = agentesDeVoz.find((item) => item.id === agente);

    if (!encontrado || encontrado.administradora !== administradora) {
      throw new Error('Recorte inválido');
    }
  }

  return {
    administradora,
    agente: agente ?? null
  };
}

export const listasComRecorte = [
  '/atendimentos',
  '/monitoramento',
  '/fila-de-curadoria',
  '/minhas-curadorias',
  '/curadorias-realizadas',
  '/manutencao'
] as const;

export type ListaComRecorte = (typeof listasComRecorte)[number];

const chavesDoFiltroDaFila = [
  'administradora',
  'agente',
  'inicio',
  'fim',
  'status',
  'conversa'
] as const;

export function filtrosDaFilaDeManutencao(busca: URLSearchParams) {
  const query = new URLSearchParams();

  for (const chave of chavesDoFiltroDaFila) {
    const valor = busca.get(chave)?.trim();

    if (valor) {
      query.set(chave, valor);
    }
  }

  return query;
}

export function destinoDaFilaDeManutencao(busca: URLSearchParams) {
  const query = filtrosDaFilaDeManutencao(busca);
  const qs = query.toString();

  return qs ? `/manutencao?${qs}` : '/manutencao';
}

export function proximoDestinoDoPercurso(entrada: {
  atendimentoAtual: string;
  pendentesNoAtendimento: number;
  proximoAtendimentoId: string | null;
  busca: URLSearchParams;
}) {
  if (entrada.pendentesNoAtendimento > 0) {
    return destinoDoDetalheNaFila(entrada.atendimentoAtual, entrada.busca);
  }

  if (entrada.proximoAtendimentoId) {
    return destinoDoDetalheNaFila(entrada.proximoAtendimentoId, entrada.busca);
  }

  return destinoDaFilaDeManutencao(entrada.busca);
}

function destinoDoDetalheNaFila(id: string, busca: URLSearchParams) {
  const ordenada = new URLSearchParams();
  ordenada.set('lista', '/manutencao');

  for (const [chave, valor] of filtrosDaFilaDeManutencao(busca)) {
    ordenada.set(chave, valor);
  }

  return `/atendimentos/${encodeURIComponent(id)}?${ordenada.toString()}`;
}

export function destinoDaLista(
  recorte: Recorte,
  lista: string = '/atendimentos'
): string {
  const caminho = listasComRecorte.find((item) => item === lista) ?? '/atendimentos';
  const query = queryDoRecorte(recorte);
  const qs = query.toString();

  return qs ? `${caminho}?${qs}` : caminho;
}

export function destinoDoBadge(
  administradora: Administradora,
  lista: string = '/atendimentos'
): string {
  return destinoDaLista({ administradora, agente: null }, lista);
}

export function destinoDoKpi(
  recorte: Recorte,
  periodo?: { inicio: string; fim: string } | null,
  indicador?: string | null,
  extras?: Record<string, string>
): string {
  const query = queryDoRecorte(recorte);

  if (periodo?.inicio && periodo.fim) {
    query.set('inicio', periodo.inicio);
    query.set('fim', periodo.fim);
  }

  if (indicador) {
    query.set('indicador', indicador);
  }

  for (const [chave, valor] of Object.entries(extras ?? {})) {
    if (valor) {
      query.set(chave, valor);
    }
  }

  const qs = query.toString();

  return qs ? `/atendimentos?${qs}` : '/atendimentos';
}

export function destinoDoPainel(
  recorte: Recorte,
  periodo: { inicio: string; fim: string } | null | undefined,
  indicador: string,
  extras?: Record<string, string>
): string {
  return destinoDoKpi(recorte, periodo, indicador, extras);
}

export function destinoDoDetalheDoDashboard(
  id: string,
  recorte: Recorte,
  periodo?: { inicio: string; fim: string } | null
): string {
  const query = queryDoRecorte(recorte);

  if (periodo?.inicio && periodo.fim) {
    query.set('inicio', periodo.inicio);
    query.set('fim', periodo.fim);
  }

  const qs = query.toString();
  return qs ? `/atendimentos/${id}?${qs}` : `/atendimentos/${id}`;
}

export function periodoMesCivil(referencia: Date): { inicio: string; fim: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(referencia);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const inicio = `${year}-${String(month).padStart(2, '0')}-01`;
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const fim = `${year}-${String(month).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  return { inicio, fim };
}
