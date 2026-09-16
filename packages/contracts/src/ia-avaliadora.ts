import { z } from 'zod';

export const configuracaoDaIaAvaliadoraSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  modelo: z.string().trim().min(1).max(200),
  temperatura: z.number().min(0).max(2).finite()
});

export type ConfiguracaoDaIaAvaliadora = z.infer<
  typeof configuracaoDaIaAvaliadoraSchema
>;
