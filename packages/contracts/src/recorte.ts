import { z } from 'zod';

export const administradoras = ['Affix', 'Alter', 'Conectaplan'] as const;

export const administradoraSchema = z.enum(administradoras);

export type Administradora = z.infer<typeof administradoraSchema>;

export type Recorte = {
  administradora: Administradora | null;
  agente: string | null;
};

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
    query.set('admin', recorte.administradora);
  }

  if (recorte.agente) {
    query.set('agente', recorte.agente);
  }

  return query;
}

export function lerRecorte(query: {
  admin?: string;
  agente?: string;
}): Recorte {
  const admin = query.admin?.trim() || undefined;
  const agente = query.agente?.trim() || undefined;
  const administradora = admin ? administradoraSchema.parse(admin) : null;

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

export function periodoMesCivil(
  referencia: Date,
  fuso = 'America/Sao_Paulo'
): { inicio: string; fim: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
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
