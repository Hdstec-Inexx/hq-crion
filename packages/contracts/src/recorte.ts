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
  '/fila-de-curadoria',
  '/minhas-curadorias',
  '/curadorias-realizadas'
] as const;

export type ListaComRecorte = (typeof listasComRecorte)[number];

export function destinoDaLista(
  recorte: Recorte,
  lista: string = '/atendimentos'
): string {
  const caminho = listasComRecorte.find((item) => item === lista) ?? '/atendimentos';
  const query = queryDoRecorte(recorte);
  const qs = query.toString();

  return qs ? `${caminho}?${qs}` : caminho;
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
