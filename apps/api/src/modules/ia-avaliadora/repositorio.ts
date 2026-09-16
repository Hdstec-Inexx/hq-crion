import {
  configuracaoDaIaAvaliadoraSchema,
  type ConfiguracaoDaIaAvaliadora
} from '@hq-crion/contracts/ia-avaliadora';

const padrao: ConfiguracaoDaIaAvaliadora = {
  prompt: 'Avalie o Atendimento pela Régua de Avaliação única das Claras.',
  modelo: 'gpt-4o',
  temperatura: 0
};

let configuracao: ConfiguracaoDaIaAvaliadora = { ...padrao };

export function lerConfiguracao() {
  return configuracaoDaIaAvaliadoraSchema.parse(configuracao);
}

export function gravarConfiguracao(proxima: ConfiguracaoDaIaAvaliadora) {
  configuracao = configuracaoDaIaAvaliadoraSchema.parse(proxima);
  return lerConfiguracao();
}
