import {
  reguaDeAvaliacaoSchema,
  type ReguaDeAvaliacao
} from '@hq-crion/contracts/regua';

export const reguaUnica: ReguaDeAvaliacao = reguaDeAvaliacaoSchema.parse({
  criterios: [
    { nome: 'Saudação', valor: 1, critico: false },
    { nome: 'Informação de Protocolo', valor: 1, critico: true },
    { nome: 'Identificação do titular', valor: 1, critico: false },
    { nome: 'Palavras proibidas', valor: 1, critico: false },
    { nome: 'Validação de e-mail', valor: 0.5, critico: false },
    { nome: 'Clareza da informação', valor: 1.5, critico: false },
    { nome: 'Resolução da demanda', valor: 1.5, critico: false },
    { nome: 'Confirmação dos dados', valor: 1, critico: false },
    { nome: 'Encerramento', valor: 1.5, critico: false }
  ],
  limiarDeAprovacao: 7
});
