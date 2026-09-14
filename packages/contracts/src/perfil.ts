import { z } from 'zod';

export const papelSchema = z.enum(['Admin', 'Gestão', 'Curador']);

export const perfilSchema = z.object({
  nome: z.string().min(1),
  email: z.string().regex(/^[^\s@]+@[^\s@]+$/, 'E-mail inválido'),
  papel: papelSchema
});

export const loginRequestSchema = z.object({
  email: z.string().trim().regex(/^[^\s@]+@[^\s@]+$/, 'E-mail inválido'),
  senha: z.string().min(1)
});

export const loginResponseSchema = z.object({
  perfil: perfilSchema,
  sessao: z.string().min(1)
});

export type Papel = z.infer<typeof papelSchema>;
export type Perfil = z.infer<typeof perfilSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
