import {
  reguaDeAvaliacaoSchema,
  type ReguaDeAvaliacao
} from '@hq-crion/contracts/regua';
import type { ClienteSql } from '../../db/cliente.js';
import { idDaLinhaUnica } from '../../db/linha-unica.js';

export const reguaUnica: ReguaDeAvaliacao = reguaDeAvaliacaoSchema.parse({
  criterios: [
    { chave: 'saudacao', nome: 'Saudação', valor: 1, critico: false, admiteNaoSeAplica: false },
    {
      chave: 'informacao-de-protocolo',
      nome: 'Informação de Protocolo',
      valor: 1,
      critico: true,
      admiteNaoSeAplica: false
    },
    {
      chave: 'identificacao-do-titular',
      nome: 'Identificação do titular',
      valor: 1,
      critico: false,
      admiteNaoSeAplica: false
    },
    {
      chave: 'palavras-proibidas',
      nome: 'Palavras proibidas',
      valor: 1,
      critico: false,
      admiteNaoSeAplica: false
    },
    {
      chave: 'validacao-de-e-mail',
      nome: 'Validação de e-mail',
      valor: 0.5,
      critico: false,
      admiteNaoSeAplica: true
    },
    {
      chave: 'clareza-da-informacao',
      nome: 'Clareza da informação',
      valor: 1.5,
      critico: false,
      admiteNaoSeAplica: false
    },
    {
      chave: 'resolucao-da-demanda',
      nome: 'Resolução da demanda',
      valor: 1.5,
      critico: false,
      admiteNaoSeAplica: false
    },
    {
      chave: 'confirmacao-dos-dados',
      nome: 'Confirmação dos dados',
      valor: 1,
      critico: false,
      admiteNaoSeAplica: false
    },
    {
      chave: 'encerramento',
      nome: 'Encerramento',
      valor: 1.5,
      critico: false,
      admiteNaoSeAplica: false
    }
  ],
  limiarDeAprovacao: 7
});

export async function lerReguaDoDeposito(cliente: ClienteSql) {
  const regua = await cliente.query(
    'SELECT limiar_de_aprovacao FROM hq_regua WHERE id = $1',
    [idDaLinhaUnica]
  );
  const limiar = (regua.rows[0] as { limiar_de_aprovacao: string | number } | undefined)
    ?.limiar_de_aprovacao;

  if (limiar === undefined) {
    throw new Error('O depósito não tem a Régua única.');
  }

  const criterios = await cliente.query(
    `SELECT nome, valor, critico, chave, admite_nao_se_aplica
     FROM hq_criterio_da_regua
     WHERE regua_id = $1
     ORDER BY ordem`,
    [idDaLinhaUnica]
  );
  const linhas = criterios.rows as Array<{
    nome: string;
    valor: string | number;
    critico: boolean;
    chave: string;
    admite_nao_se_aplica: boolean;
  }>;

  return reguaDeAvaliacaoSchema.parse({
    limiarDeAprovacao: Number(limiar),
    criterios: linhas.map((linha) => ({
      chave: linha.chave,
      nome: linha.nome,
      valor: Number(linha.valor),
      critico: linha.critico,
      admiteNaoSeAplica: linha.admite_nao_se_aplica
    }))
  });
}

export function aplicarRegua(regua: ReguaDeAvaliacao) {
  const carregada = reguaDeAvaliacaoSchema.parse(regua);
  reguaUnica.limiarDeAprovacao = carregada.limiarDeAprovacao;
  reguaUnica.criterios.splice(0, reguaUnica.criterios.length, ...carregada.criterios);
}
