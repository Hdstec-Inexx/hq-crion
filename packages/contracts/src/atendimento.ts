import { z } from 'zod';
import { administradoraSchema } from './recorte.js';

export const atendimentoListItemSchema = z.object({
  id: z.string().min(1),
  administradora: administradoraSchema,
  agente: z.string().min(1),
  agenteId: z.string().min(1),
  iniciadoEm: z.string().min(1),
  motivo: z.string().min(1),
  nota: z.number(),
  status: z.string().min(1),
  curadoria: z.boolean(),
  conversa: z.string().min(1),
  custo: z.string().min(1).optional()
});

export const listagemResponseSchema = z.object({
  recorte: z.object({
    administradora: administradoraSchema.nullable(),
    agente: z.string().nullable()
  }),
  pagina: z.number().int().min(1),
  tamanho: z.literal(50),
  total: z.number().int().min(0),
  itens: z.array(atendimentoListItemSchema)
});

export type AtendimentoListItem = z.infer<typeof atendimentoListItemSchema>;
export type ListagemResponse = z.infer<typeof listagemResponseSchema>;
