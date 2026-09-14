import { z } from 'zod';

export const criterioDaReguaSchema = z.object({
  nome: z.string().min(1),
  valor: z.number().positive(),
  critico: z.boolean()
});

export const reguaDeAvaliacaoSchema = z.object({
  criterios: z.array(criterioDaReguaSchema).min(1),
  limiarDeAprovacao: z.number().positive()
});

export type CriterioDaRegua = z.infer<typeof criterioDaReguaSchema>;
export type ReguaDeAvaliacao = z.infer<typeof reguaDeAvaliacaoSchema>;
