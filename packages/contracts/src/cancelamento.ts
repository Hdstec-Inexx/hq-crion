import { z } from 'zod';
import type { AtendimentoListItem } from './atendimento.js';
import { administradoraSchema, recorteSchema } from './recorte.js';

export const categoriasDeCausaCancelamento = [
  'Venda mal feita / Divergência comercial',
  'Migração para concorrente',
  'Preço / Reajuste',
  'Rede credenciada / Cobertura',
  'Insatisfação com atendimento',
  'Problema financeiro / Boleto',
  'Outros'
] as const;

export type CategoriaCausaCancelamento =
  (typeof categoriasDeCausaCancelamento)[number];

export const categoriaCausaCancelamentoSchema = z.enum(
  categoriasDeCausaCancelamento
);

export const origemDiagnosticoCancelamentoSchema = z.enum(['ia', 'heuristica']);
export type OrigemDiagnosticoCancelamento = z.infer<
  typeof origemDiagnosticoCancelamentoSchema
>;

export const diagnosticoCancelamentoSchema = z.object({
  houveIntencaoCancelamento: z.boolean(),
  categoriaCausa: categoriaCausaCancelamentoSchema.nullable().optional(),
  vendaMalFeita: z.boolean().optional(),
  concorrenteCitado: z.string().nullable().optional(),
  diagnostico: z.string().nullable().optional(),
  evidenciaTrecho: z.string().nullable().optional(),
  origem: origemDiagnosticoCancelamentoSchema.optional()
});

export type DiagnosticoCancelamento = z.infer<
  typeof diagnosticoCancelamentoSchema
>;

export const cancelamentoItemSchema = z.object({
  id: z.string().min(1),
  administradora: administradoraSchema,
  agente: z.string().min(1),
  agenteId: z.string().min(1),
  iniciadoEm: z.string().min(1),
  motivo: z.string().min(1),
  nota: z.number(),
  notaIa: z.number(),
  notaCurador: z.number().nullable().optional(),
  status: z.string().min(1),
  curadoria: z.boolean(),
  conversa: z.string().min(1),
  custo: z.string().min(1).optional(),
  favoritadoPeloUsuario: z.boolean().optional(),
  favoritosCount: z.number().int().min(0).optional(),
  favoritosPerfis: z.array(z.string()).optional(),
  diagnosticoCancelamento: diagnosticoCancelamentoSchema
});

export type CancelamentoItem = z.infer<typeof cancelamentoItemSchema>;

// Assegura em tempo de compilação que CancelamentoItem é estruturalmente compatível com AtendimentoListItem
const _validaCompatibilidade: AtendimentoListItem = {} as CancelamentoItem;
void _validaCompatibilidade;

export const kpisCancelamentoSchema = z.object({
  totalAtendimentos: z.number().int().min(0),
  totalCancelamentos: z.number().int().min(0),
  percentualCancelamentos: z.number(),
  totalVendaMalFeita: z.number().int().min(0),
  percentualVendaMalFeita: z.number(),
  totalConcorrencia: z.number().int().min(0),
  principalConcorrente: z.string().nullable()
});

export type KpisCancelamento = z.infer<typeof kpisCancelamentoSchema>;

export const cancelamentoPorCausaSchema = z.object({
  causa: categoriaCausaCancelamentoSchema,
  quantidade: z.number().int().min(0),
  percentual: z.number()
});

export type CancelamentoPorCausa = z.infer<typeof cancelamentoPorCausaSchema>;

export const cancelamentoPorConcorrenteSchema = z.object({
  concorrente: z.string().min(1),
  quantidade: z.number().int().min(0),
  vendaMalFeitaCount: z.number().int().min(0)
});

export type CancelamentoPorConcorrente = z.infer<
  typeof cancelamentoPorConcorrenteSchema
>;

export const painelDeCancelamentosResponseSchema = z.object({
  recorte: recorteSchema,
  periodo: z.object({
    inicio: z.string().min(1),
    fim: z.string().min(1)
  }),
  kpis: kpisCancelamentoSchema,
  porCausa: z.array(cancelamentoPorCausaSchema),
  porConcorrente: z.array(cancelamentoPorConcorrenteSchema),
  itens: z.array(cancelamentoItemSchema)
});

export type PainelDeCancelamentosResponse = z.infer<
  typeof painelDeCancelamentosResponseSchema
>;

const recorteEPeriodoFiltroFields = {
  administradora: administradoraSchema.nullable().optional(),
  agente: z.string().nullable().optional(),
  inicio: z.string().nullable().optional(),
  fim: z.string().nullable().optional()
};

export const filtrosCancelamentoQuerySchema = z.object({
  ...recorteEPeriodoFiltroFields,
  causa: categoriaCausaCancelamentoSchema.optional(),
  vendaMalFeita: z.enum(['sim', 'nao', 'todos']).optional(),
  comConcorrente: z.enum(['sim', 'nao', 'todos']).optional(),
  concorrente: z.string().trim().max(200).optional(),
  busca: z.string().trim().max(200).optional()
});

export type FiltrosCancelamentoQuery = z.infer<
  typeof filtrosCancelamentoQuerySchema
>;

export const pesquisaIaCancelamentoRequestSchema = z.object({
  pergunta: z.string().trim().min(2).max(500),
  ...recorteEPeriodoFiltroFields
});

export type PesquisaIaCancelamentoRequest = z.infer<
  typeof pesquisaIaCancelamentoRequestSchema
>;

export const fontePesquisaIaSchema = z.enum(['openrouter', 'analitico-local']);
export type FontePesquisaIa = z.infer<typeof fontePesquisaIaSchema>;

export const evidenciaPesquisaIaSchema = z.object({
  id: z.string().min(1),
  administradora: administradoraSchema.nullable().optional(),
  agente: z.string().min(1).optional(),
  iniciadoEm: z.string().optional(),
  motivo: z.string().optional(),
  categoriaCausa: categoriaCausaCancelamentoSchema.nullable().optional(),
  vendaMalFeita: z.boolean().optional(),
  concorrenteCitado: z.string().nullable().optional(),
  diagnostico: z.string().nullable().optional(),
  trecho: z.string().nullable().optional()
});

export type EvidenciaPesquisaIa = z.infer<typeof evidenciaPesquisaIaSchema>;

export const pesquisaIaCancelamentoResponseSchema = z.object({
  pergunta: z.string().min(1),
  resposta: z.string().min(1),
  modelo: z.string().min(1),
  fonte: fontePesquisaIaSchema,
  evidencias: z.array(evidenciaPesquisaIaSchema)
});

export type PesquisaIaCancelamentoResponse = z.infer<
  typeof pesquisaIaCancelamentoResponseSchema
>;

export const analisarPassivoRequestSchema = z
  .object({
    ...recorteEPeriodoFiltroFields,
    limite: z.number().int().positive().max(200).optional()
  })
  .optional()
  .default({});

export type AnalisarPassivoRequest = z.infer<
  typeof analisarPassivoRequestSchema
>;

export const analisarPassivoResponseSchema = z.object({
  analisados: z.number().int().min(0),
  cancelamentosDetectados: z.number().int().min(0),
  modelo: z.string().min(1),
  fonte: fontePesquisaIaSchema
});

export type AnalisarPassivoResponse = z.infer<
  typeof analisarPassivoResponseSchema
>;
