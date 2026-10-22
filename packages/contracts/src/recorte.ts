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
  nome: string;
  administradora: Administradora | null;
  administradorasAtendidas?: Administradora[];
};

export const agenteDeVozSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  administradora: administradoraSchema.nullable(),
  administradorasAtendidas: z.array(administradoraSchema).optional()
});

export const catalogoAgentesResponseSchema = z.array(agenteDeVozSchema);

export function administradoraNoNomeDoAgente(nome: string): Administradora | null {
  const texto = nome.toLocaleLowerCase('pt-BR');
  const achadas = administradoras.filter((nomeAdm) =>
    texto.includes(nomeAdm.toLocaleLowerCase('pt-BR'))
  );

  if (achadas.length === 0) {
    return null;
  }

  return achadas.reduce((maior, atual) => (atual.length > maior.length ? atual : maior));
}

export const agentesDeVoz: AgenteDeVoz[] = [
  { id: 'affix-0800', administradora: 'Affix', nome: 'Clara Affix 0800' },
  { id: 'affix-wa', administradora: 'Affix', nome: 'Clara Affix WhatsApp' },
  { id: 'alter-1', administradora: 'Alter', nome: 'Clara Alter' },
  { id: 'conecta-1', administradora: 'Conectaplan', nome: 'Clara Conectaplan' }
];

export const idsSementeAgentes = new Set<string>([
  'affix-0800',
  'affix-wa',
  'alter-1',
  'conecta-1'
]);

export function buscarAgenteNoCatalogo(
  id: string,
  catalogo?: AgenteDeVoz[]
): AgenteDeVoz | undefined {
  return (
    catalogo?.find((item) => item.id === id) ??
    agentesDeVoz.find((item) => item.id === id)
  );
}

export function agenteCompativelComAdministradora(
  agente: AgenteDeVoz,
  administradora: Administradora | null
): boolean {
  if (!administradora) {
    return true;
  }

  if (agente.administradora !== null) {
    return agente.administradora === administradora;
  }

  return Boolean(agente.administradorasAtendidas?.includes(administradora));
}

export function agentesCompativeisComAdministradora(
  catalogo: AgenteDeVoz[],
  administradora: Administradora | null
): AgenteDeVoz[] {
  if (!administradora) {
    return catalogo;
  }

  return catalogo.filter((agente) =>
    agenteCompativelComAdministradora(agente, administradora)
  );
}

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
  opcoes?: { resetarPagina?: boolean; catalogo?: AgenteDeVoz[] }
): URLSearchParams {
  const administradoraValida = administradoraSchema.safeParse(administradora).data ?? null;
  const agenteTrim = agente?.trim();
  const agenteLimpo = agenteTrim && agenteTrim.length <= 200 ? agenteTrim : null;

  let agenteFinal = agenteLimpo;
  if (administradoraValida && agenteLimpo) {
    const agenteEncontrado = buscarAgenteNoCatalogo(agenteLimpo, opcoes?.catalogo);

    if (agenteEncontrado && !agenteCompativelComAdministradora(agenteEncontrado, administradoraValida)) {
      agenteFinal = null;
    }
  }

  const recorteQuery = queryDoRecorte({
    administradora: administradoraValida,
    agente: agenteFinal
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

export function lerRecorte(
  query: {
    administradora?: string;
    agente?: string;
  },
  catalogo?: AgenteDeVoz[]
): Recorte {
  const administradoraBruta = query.administradora?.trim() || undefined;
  const agente = query.agente?.trim() || undefined;

  if (agente && agente.length > 200) {
    throw new Error('Recorte inválido');
  }

  const administradora = administradoraBruta
    ? administradoraSchema.parse(administradoraBruta)
    : null;

  if (agente && administradora) {
    const agenteEncontrado = buscarAgenteNoCatalogo(agente, catalogo);

    if (
      agenteEncontrado &&
      agenteEncontrado.administradora !== null &&
      agenteEncontrado.administradora !== administradora
    ) {
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
  '/cancelamentos',
  '/favoritos',
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

export type PeriodoFechado = { inicio: string; fim: string };

const diaCivil = /^\d{4}-\d{2}-\d{2}$/;

export function diaCivilEmSaoPaulo(referencia: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(referencia);
}

export function periodoAteHoje(referencia: Date): PeriodoFechado {
  const fim = diaCivilEmSaoPaulo(referencia);
  return { inicio: `${fim.slice(0, 8)}01`, fim };
}

function diaCivilValido(valor: string) {
  if (!diaCivil.test(valor)) {
    return false;
  }

  const data = new Date(`${valor}T00:00:00Z`);

  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function umAnoDepois(inicio: string) {
  const [ano, mes, dia] = inicio.split('-').map(Number);
  const limite = new Date(Date.UTC(ano + 1, mes - 1, dia));

  if (limite.getUTCMonth() === mes - 1) {
    return limite.toISOString().slice(0, 10);
  }

  return new Date(Date.UTC(ano + 1, mes, 0)).toISOString().slice(0, 10);
}

function cabeEmUmAno(inicio: string, fim: string) {
  return fim <= umAnoDepois(inicio);
}

function parFechado(inicio: string, fim: string): PeriodoFechado | undefined {
  if (!diaCivilValido(inicio) || !diaCivilValido(fim) || inicio > fim || !cabeEmUmAno(inicio, fim)) {
    return undefined;
  }

  return { inicio, fim };
}

function texto(valor: string | null | undefined) {
  return valor?.trim() ?? '';
}

export function periodoDaListagem(
  query: { inicio?: string | null; fim?: string | null },
  referencia = new Date()
): PeriodoFechado | undefined {
  const inicio = texto(query.inicio);
  const fim = texto(query.fim);

  if (!inicio && !fim) {
    return periodoMesCivil(referencia);
  }

  if (inicio && !fim) {
    return diaCivilValido(inicio) ? { inicio, fim: inicio } : undefined;
  }

  if (!inicio) {
    return undefined;
  }

  return parFechado(inicio, fim);
}

export function periodoDoDashboard(
  query: { inicio?: string | null; fim?: string | null },
  referencia = new Date()
): PeriodoFechado | undefined {
  const inicio = texto(query.inicio);
  const fim = texto(query.fim);
  const fallback = periodoAteHoje(referencia);

  if (!inicio && !fim) {
    return fallback;
  }

  return parFechado(inicio || fallback.inicio, fim || fallback.fim);
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
