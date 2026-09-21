import { z } from 'zod';
import { recorteSchema } from './recorte.js';

export const idDoKpiSchema = z.enum([
  'atendimentos',
  'tma',
  'taxaDeResolvidas',
  'sla',
  'notaMediaIa',
  'notaMediaCurador',
  'avaliadosIa',
  'avaliadosCurador',
  'promessasCumpridas',
  'tempoMedioAteResolucao',
  'aprovacao'
]);

export const kpiDoDashboardSchema = z.object({
  id: idDoKpiSchema,
  rotulo: z.string().min(1),
  valor: z.number().nullable(),
  meta: z.number().optional(),
  limiarEmSegundos: z.number().optional()
});

export const idDoPainelSchema = z.enum([
  'motivos',
  'acertoPorCriterio',
  'concordancia',
  'naoConformidade',
  'pioresAtendimentos'
]);

export const paineisDoDashboardSchema = z.object({
  motivos: z.array(
    z.object({
      motivo: z.string().min(1),
      quantidade: z.number().int().min(0)
    })
  ),
  acertoPorCriterio: z.array(
    z.object({
      criterio: z.string().min(1),
      percentual: z.number().nullable(),
      atendidos: z.number().int().min(0),
      aplicaveis: z.number().int().min(0)
    })
  ),
  concordancia: z.object({
    nota: z.number().nullable(),
    criterios: z.number().nullable(),
    porCriterio: z.array(
      z.object({
        criterio: z.string().min(1),
        percentual: z.number().nullable(),
        iguais: z.number().int().min(0),
        comparaveis: z.number().int().min(0)
      })
    )
  }),
  naoConformidade: z.array(
    z.object({
      criterio: z.string().min(1),
      quantidade: z.number().int().min(0)
    })
  ),
  pioresAtendimentos: z.array(
    z.object({
      id: z.string().min(1),
      nota: z.number()
    })
  )
});

export const dashboardResponseSchema = z.object({
  recorte: recorteSchema,
  periodo: z.object({
    inicio: z.string().min(1),
    fim: z.string().min(1)
  }),
  kpis: z.array(kpiDoDashboardSchema).min(11),
  paineis: paineisDoDashboardSchema
});

export type IdDoKpi = z.infer<typeof idDoKpiSchema>;
export type IdDoPainel = z.infer<typeof idDoPainelSchema>;
export type IndicadorDoDashboard = IdDoKpi | IdDoPainel;
export type KpiDoDashboard = z.infer<typeof kpiDoDashboardSchema>;
export type PaineisDoDashboard = z.infer<typeof paineisDoDashboardSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
type LinhaDeAcertoPorCriterio = PaineisDoDashboard['acertoPorCriterio'][number];
type LinhaDeConcordanciaPorCriterio = PaineisDoDashboard['concordancia']['porCriterio'][number];

export function fraseDoHoverDeAcertoPorCriterio(
  contagem: Pick<LinhaDeAcertoPorCriterio, 'percentual' | 'atendidos' | 'aplicaveis'>
) {
  if (contagem.percentual === null) {
    return 'nenhum aplicável';
  }

  return `${contagem.atendidos} atendidos · ${contagem.aplicaveis} aplicáveis`;
}

export function fraseDoHoverDeConcordanciaPorCriterio(
  contagem: Pick<LinhaDeConcordanciaPorCriterio, 'percentual' | 'iguais' | 'comparaveis'>
) {
  if (contagem.percentual === null) {
    return 'nenhum comparável';
  }

  return `${contagem.iguais} iguais · ${contagem.comparaveis} comparáveis`;
}
