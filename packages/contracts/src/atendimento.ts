import { z } from 'zod';
import type { Papel } from './perfil.js';
import { administradoraSchema, recorteSchema } from './recorte.js';

export function custoVisivelPara(papel: Papel) {
  return papel !== 'Curador';
}

export function downloadVisivelPara(papel: Papel) {
  return papel !== 'Curador';
}

export const caminhoDeMidiaSchema = z
  .string()
  .min(1)
  .refine(
    (caminho) =>
      caminho.startsWith('/') &&
      !caminho.startsWith('//') &&
      !caminho.includes('\\') &&
      !caminho.includes(':'),
    { message: 'Caminho de mídia deve ser relativo ao HQ' }
  );

export function caminhoDeMidiaPermitido(caminho: string) {
  return caminhoDeMidiaSchema.safeParse(caminho).success;
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

export const curadorDaListagemSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1)
});

export const listagemResponseSchema = z.object({
  recorte: recorteSchema,
  pagina: z.number().int().min(1),
  tamanho: z.literal(50),
  total: z.number().int().min(0),
  itens: z.array(atendimentoListItemSchema),
  curadores: z.array(curadorDaListagemSchema)
});

export const statusDoComentarioSchema = z.enum(['Pendente', 'Resolvido']);

export const comentarioDaFilaSchema = z.object({
  id: z.string().min(1),
  atendimentoId: z.string().min(1),
  administradora: administradoraSchema,
  agente: z.string().min(1),
  agenteId: z.string().min(1),
  conversa: z.string().min(1),
  data: z.string().min(1),
  texto: z.string().min(1),
  status: statusDoComentarioSchema,
  resolvidoPor: z.string().min(1).optional(),
  resolvidoEm: z.string().min(1).optional()
});

export const percursoDaFilaDeManutencaoSchema = z.object({
  pendentesNoAtendimento: z.number().int().min(0),
  comentarioPendenteId: z.string().min(1).nullable(),
  textoPendente: z.string().min(1).nullable(),
  proximoAtendimentoId: z.string().min(1).nullable()
});

export const filaDeManutencaoResponseSchema = z.object({
  recorte: recorteSchema,
  pagina: z.number().int().min(1),
  tamanho: z.literal(50),
  total: z.number().int().min(0),
  itens: z.array(comentarioDaFilaSchema)
});

export const estadoDoCriterioSchema = z.enum([
  'Atendido',
  'Não atendido',
  'Não se aplica'
]);

export const criterioAvaliadoSchema = z.object({
  chave: z.string().min(1).optional(),
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

export const avaliacaoDoCuradorSchema = avaliacaoSchema.extend({
  notaDaAvaliacaoDaIa: z.number(),
  comentario: z.string().min(1).optional(),
  curador: z.string().min(1)
});

const criterioDaGravacaoSchema = criterioAvaliadoSchema.extend({
  nome: z.string().trim().min(1).max(200),
  pontos: z.number().finite()
});

export const gravacaoDaAvaliacaoDaIaSchema = z.object({
  nota: z.number().finite().min(0).max(10),
  criterios: z.array(criterioDaGravacaoSchema).min(1).max(30)
});

export const conferenciaRequestSchema = z.object({
  checklist: z.array(criterioAvaliadoSchema).min(1),
  notaDaRegua: z.number(),
  notaDaAvaliacaoDaIa: z.number(),
  comentario: z.string().trim().min(1).optional()
});

export const turnoDaTranscricaoSchema = z.object({
  locutor: z.enum(['Agente de Voz', 'Cliente']),
  quando: z.string().min(1),
  texto: z.string().min(1)
});

export const atendimentoDetalheSchema = atendimentoListItemSchema.extend({
  audio: caminhoDeMidiaSchema.optional(),
  downloadDeAudio: caminhoDeMidiaSchema.optional(),
  transcricao: z.array(turnoDaTranscricaoSchema),
  avaliacaoDaIa: avaliacaoSchema.optional(),
  avaliacaoDoCurador: avaliacaoDoCuradorSchema.optional()
});

export const monitoramentoListItemSchema = z.object({
  id: z.string().min(1),
  administradora: administradoraSchema.nullable(),
  agente: z.string().min(1),
  agenteId: z.string().min(1),
  iniciadoEm: z.string().min(1),
  motivo: z.string().min(1),
  status: z.literal('Em andamento')
});

export const monitoramentoListagemResponseSchema = z.object({
  recorte: recorteSchema,
  pagina: z.number().int().min(1),
  tamanho: z.literal(50),
  total: z.number().int().min(0),
  itens: z.array(monitoramentoListItemSchema),
  fonteConfigurada: z.boolean()
});

export const monitoramentoDetalheSchema = z.object({
  id: z.string().min(1),
  administradora: administradoraSchema.nullable(),
  agente: z.string().min(1),
  agenteId: z.string().min(1),
  iniciadoEm: z.string().min(1),
  motivo: z.string().min(1),
  status: z.literal('Em andamento'),
  transcricao: z.array(turnoDaTranscricaoSchema)
});

export type CuradorDaListagem = z.infer<typeof curadorDaListagemSchema>;
export type AtendimentoListItem = z.infer<typeof atendimentoListItemSchema>;
export type ListagemResponse = z.infer<typeof listagemResponseSchema>;
export type StatusDoComentario = z.infer<typeof statusDoComentarioSchema>;
export type ComentarioDaFila = z.infer<typeof comentarioDaFilaSchema>;
export type FilaDeManutencaoResponse = z.infer<typeof filaDeManutencaoResponseSchema>;
export type PercursoDaFilaDeManutencao = z.infer<typeof percursoDaFilaDeManutencaoSchema>;
export type EstadoDoCriterio = z.infer<typeof estadoDoCriterioSchema>;
export type CriterioAvaliado = z.infer<typeof criterioAvaliadoSchema>;
export type Avaliacao = z.infer<typeof avaliacaoSchema>;
export type AvaliacaoDoCurador = z.infer<typeof avaliacaoDoCuradorSchema>;
export type GravacaoDaAvaliacaoDaIa = z.infer<typeof gravacaoDaAvaliacaoDaIaSchema>;
export type ConferenciaRequest = z.infer<typeof conferenciaRequestSchema>;
export type TurnoDaTranscricao = z.infer<typeof turnoDaTranscricaoSchema>;
export type AtendimentoDetalhe = z.infer<typeof atendimentoDetalheSchema>;
export type MonitoramentoDetalhe = z.infer<typeof monitoramentoDetalheSchema>;
export type MonitoramentoListagemResponse = z.infer<
  typeof monitoramentoListagemResponseSchema
>;
