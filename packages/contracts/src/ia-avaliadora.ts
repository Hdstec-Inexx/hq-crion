import { z } from 'zod';

export const configuracaoDaIaAvaliadoraSchema = z.object({
  prompt: z.string().min(1),
  modelo: z.string().min(1),
  temperatura: z.number().min(0).max(2)
});

export type ConfiguracaoDaIaAvaliadora = z.infer<
  typeof configuracaoDaIaAvaliadoraSchema
>;
