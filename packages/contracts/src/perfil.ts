import { z } from 'zod';

export const papelSchema = z.enum(['Admin', 'Gestão', 'Curador']);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+$/, 'E-mail inválido');

export const perfilSchema = z.object({
  nome: z.string().min(1),
  email: emailSchema,
  papel: papelSchema
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1)
});

export const loginResponseSchema = z.object({
  perfil: perfilSchema,
  sessao: z.string().min(1)
});

export const perfilComIdSchema = perfilSchema.extend({
  id: z.string().min(1)
});

export const listaDePerfisSchema = z.object({
  perfis: z.array(perfilComIdSchema)
});

export type Papel = z.infer<typeof papelSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type PerfilComId = z.infer<typeof perfilComIdSchema>;
export type ListaDePerfis = z.infer<typeof listaDePerfisSchema>;
