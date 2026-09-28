import type { TurnoDaTranscricao } from '@hq-crion/contracts/atendimento';

export type ObservacaoDaTranscricao = {
  transcricao: TurnoDaTranscricao[];
  observando: boolean;
};

function copiar(turno: TurnoDaTranscricao): TurnoDaTranscricao {
  return { locutor: turno.locutor, quando: turno.quando, texto: turno.texto };
}

function indiceDaUltimaFalaDoAgente(turnos: readonly TurnoDaTranscricao[]) {
  for (let indice = turnos.length - 1; indice >= 0; indice -= 1) {
    if (turnos[indice]?.locutor === 'Agente de Voz') {
      return indice;
    }
  }

  return -1;
}

function transcricaoInteiraDaFonte(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  const primeiraDaTela = tela[0];
  const primeiraDaFonte = fonte[0];

  if (!primeiraDaTela || !primeiraDaFonte || fonte.length < tela.length) {
    return false;
  }

  if (primeiraDaTela.locutor !== primeiraDaFonte.locutor) {
    return false;
  }

  if (primeiraDaTela.texto === primeiraDaFonte.texto) {
    return true;
  }

  return indiceDaUltimaFalaDoAgente(tela) === 0 && primeiraDaFonte.locutor === 'Agente de Voz';
}

export function mesclarTranscricao(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  if (fonte.length === 0) {
    return tela.map(copiar);
  }

  if (tela.length === 0 || transcricaoInteiraDaFonte(tela, fonte)) {
    return fonte.map(copiar);
  }

  return tela.map(copiar);
}

export function observarTranscricao(
  atual: ObservacaoDaTranscricao,
  vinda: { aberto: boolean; transcricao: readonly TurnoDaTranscricao[] }
): ObservacaoDaTranscricao {
  if (!atual.observando) {
    return {
      transcricao: atual.transcricao.map(copiar),
      observando: false
    };
  }

  return {
    transcricao: mesclarTranscricao(atual.transcricao, vinda.transcricao),
    observando: vinda.aberto
  };
}

export function avisoDaTranscricao(entrada: { observando: boolean; quantidade: number }) {
  if (entrada.observando && entrada.quantidade === 0) {
    return 'Aguardando a próxima fala.';
  }

  return null;
}

export function textoDaObservacao(observando: boolean) {
  if (observando) {
    return 'Observação em texto, sem áudio e sem ação no contato.';
  }

  return 'Observação encerrada. O texto permanece, sem áudio e sem ação no contato.';
}
