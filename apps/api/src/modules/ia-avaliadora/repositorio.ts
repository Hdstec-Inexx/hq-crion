import {
  configuracaoDaIaAvaliadoraSchema,
  type ConfiguracaoDaIaAvaliadora
} from '@hq-crion/contracts/ia-avaliadora';
import { exigirLinhaGravada, type ClienteSql } from '../../db/cliente.js';
import { idDaLinhaUnica } from '../../db/linha-unica.js';

export const configuracaoPadraoDaIa: ConfiguracaoDaIaAvaliadora = {
  prompt: 'Avalie o Atendimento pela Régua de Avaliação única das Claras.',
  modelo: 'gpt-4o',
  temperatura: 0
};

let configuracao: ConfiguracaoDaIaAvaliadora = { ...configuracaoPadraoDaIa };
let deposito: ClienteSql | null = null;

export function usarDepositoDaIa(cliente: ClienteSql | null) {
  deposito = cliente;
}

export async function lerConfiguracaoDoDeposito(cliente: ClienteSql) {
  const resultado = await cliente.query(
    'SELECT prompt, modelo, temperatura FROM hq_ia_avaliadora WHERE id = $1',
    [idDaLinhaUnica]
  );
  const linha = resultado.rows[0] as
    | { prompt: string; modelo: string; temperatura: string | number }
    | undefined;

  if (!linha) {
    throw new Error('O depósito não tem a configuração da IA Avaliadora.');
  }

  return configuracaoDaIaAvaliadoraSchema.parse({
    prompt: linha.prompt,
    modelo: linha.modelo,
    temperatura: Number(linha.temperatura)
  });
}

export function aplicarConfiguracaoDaIa(proxima: ConfiguracaoDaIaAvaliadora) {
  configuracao = configuracaoDaIaAvaliadoraSchema.parse(proxima);
}

export function lerConfiguracao() {
  return configuracaoDaIaAvaliadoraSchema.parse(configuracao);
}

export async function gravarConfiguracao(proxima: ConfiguracaoDaIaAvaliadora) {
  const validada = configuracaoDaIaAvaliadoraSchema.parse(proxima);

  if (deposito) {
    await exigirLinhaGravada(
      deposito,
      `UPDATE hq_ia_avaliadora
       SET prompt = $2, modelo = $3, temperatura = $4
       WHERE id = $1`,
      [idDaLinhaUnica, validada.prompt, validada.modelo, validada.temperatura],
      'A configuração da IA Avaliadora não está no depósito.'
    );
  }

  configuracao = validada;
  return lerConfiguracao();
}
