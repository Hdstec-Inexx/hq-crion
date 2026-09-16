import { z } from 'zod';
import { recorteSchema } from './recorte.js';

export const idDoKpiSchema = z.enum(['atendimentos', 'notaMedia', 'aprovacao']);

export const kpiDoDashboardSchema = z.object({
  id: idDoKpiSchema,
  rotulo: z.string().min(1),
  valor: z.number().nullable()
});

export const dashboardResponseSchema = z.object({
  recorte: recorteSchema,
  periodo: z.object({
    inicio: z.string().min(1),
    fim: z.string().min(1)
  }),
  kpis: z.array(kpiDoDashboardSchema).min(3)
});

export type IdDoKpi = z.infer<typeof idDoKpiSchema>;
export type KpiDoDashboard = z.infer<typeof kpiDoDashboardSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
