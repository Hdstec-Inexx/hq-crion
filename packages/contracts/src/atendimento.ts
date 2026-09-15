import { z } from 'zod';
import type { Papel } from './perfil.js';
import { administradoraSchema, recorteSchema } from './recorte.js';

export function custoVisivelPara(papel: Papel) {
  return papel !== 'Curador';
}

export function downloadVisivelPara(papel: Papel) {
  return papel !== 'Curador';
}

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
  recorte: recorteSchema,
  pagina: z.number().int().min(1),
  tamanho: z.literal(50),
  total: z.number().int().min(0),
  itens: z.array(atendimentoListItemSchema)
});

export const estadoDoCriterioSchema = z.enum([
  'Atendido',
  'Não atendido',
  'Não se aplica'
]);

export const criterioAvaliadoSchema = z.object({
  nome: z.string().min(1),
  estado: estadoDoCriterioSchema,
  pontos: z.number(),
  critico: z.boolean()
});

export const avaliacaoSchema = z.object({
  nota: z.number(),
  aprovacao: z.enum(['Aprovado', 'Reprovado']),
  criterios: z.array(criterioAvaliadoSchema).min(1)
});

export const turnoDaTranscricaoSchema = z.object({
  locutor: z.enum(['Agente de Voz', 'Cliente']),
  quando: z.string().min(1),
  texto: z.string().min(1)
});

export const atendimentoDetalheSchema = atendimentoListItemSchema.extend({
  audio: z.string().min(1),
  downloadDeAudio: z.string().min(1).optional(),
  transcricao: z.array(turnoDaTranscricaoSchema),
  avaliacaoDaIa: avaliacaoSchema,
  avaliacaoDoCurador: avaliacaoSchema.optional()
});

export type AtendimentoListItem = z.infer<typeof atendimentoListItemSchema>;
export type ListagemResponse = z.infer<typeof listagemResponseSchema>;
export type EstadoDoCriterio = z.infer<typeof estadoDoCriterioSchema>;
export type CriterioAvaliado = z.infer<typeof criterioAvaliadoSchema>;
export type Avaliacao = z.infer<typeof avaliacaoSchema>;
export type TurnoDaTranscricao = z.infer<typeof turnoDaTranscricaoSchema>;
export type AtendimentoDetalhe = z.infer<typeof atendimentoDetalheSchema>;
