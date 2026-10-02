import type { EventoDaObservacao, TurnoDaTranscricao } from '@hq-crion/contracts/atendimento';

export type ObservacaoDaTranscricao = {
  transcricao: TurnoDaTranscricao[];
  observando: boolean;
};

function copiar(turno: TurnoDaTranscricao): TurnoDaTranscricao {
  return { locutor: turno.locutor, quando: turno.quando, texto: turno.texto };
}

function turnoSoDeFerramenta(turno: TurnoDaTranscricao) {
  const linhas = turno.texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);

  return linhas.length > 0 && linhas.every((linha) => linhaDeFerramenta(linha));
}

function indiceDaUltimaFalaDoAgente(turnos: readonly TurnoDaTranscricao[]) {
  for (let indice = turnos.length - 1; indice >= 0; indice -= 1) {
    const turno = turnos[indice];
    if (turno?.locutor === 'Agente de Voz' && !turnoSoDeFerramenta(turno)) {
      return indice;
    }
  }

  return -1;
}

function linhaDeFerramenta(linha: string) {
  const texto = linha.trim();
  return (
    texto.startsWith('[Chamada de Ferramenta:') || texto.startsWith('[Resultado da Ferramenta:')
  );
}

function acrescentaLinhaDeFerramenta(atual: string, vindo: string) {
  if (!vindo.startsWith(atual)) {
    return false;
  }

  const resto = vindo.slice(atual.length).trim();
  return resto.length > 0 && resto.split('\n').every((linha) => linhaDeFerramenta(linha));
}

function incorporarFerramentas(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  let cursor = 0;

  return tela.map((turno) => {
    const indice = fonte.findIndex(
      (item, posicao) =>
        posicao >= cursor &&
        item.locutor === turno.locutor &&
        (item.quando === turno.quando || turno.quando === '—') &&
        acrescentaLinhaDeFerramenta(turno.texto, item.texto)
    );

    if (indice < 0) {
      return copiar(turno);
    }

    cursor = indice + 1;
    const daFonte = fonte[indice];

    if (!daFonte) {
      return copiar(turno);
    }

    return {
      ...copiar(turno),
      texto: daFonte.texto,
      quando: turno.quando === '—' ? daFonte.quando : turno.quando
    };
  });
}

function mesmoTurno(a: TurnoDaTranscricao, b: TurnoDaTranscricao) {
  return a.locutor === b.locutor && a.quando === b.quando && a.texto === b.texto;
}

function mesmoInstante(a: TurnoDaTranscricao, b: TurnoDaTranscricao) {
  return a.locutor === b.locutor && a.quando === b.quando;
}

function jaEstaNaTela(tela: readonly TurnoDaTranscricao[], turno: TurnoDaTranscricao) {
  return tela.some((item) => item.locutor === turno.locutor && item.texto === turno.texto);
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

  return (
    indiceDaUltimaFalaDoAgente(tela) === 0 &&
    primeiraDaTela.locutor === 'Agente de Voz' &&
    mesmoInstante(primeiraDaTela, primeiraDaFonte)
  );
}

function mesclarFragmento(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  const maior = Math.min(tela.length, fonte.length);
  const ultimaDoAgente = indiceDaUltimaFalaDoAgente(tela);

  for (let tamanho = maior; tamanho >= 1; tamanho -= 1) {
    const inicioNaTela = tela.length - tamanho;
    let sufixoConfere = true;
    let correcao = -1;

    for (let indice = 0; indice < tamanho; indice += 1) {
      const daTela = tela[inicioNaTela + indice];
      const daFonte = fonte[indice];

      if (!daTela || !daFonte) {
        sufixoConfere = false;
        break;
      }

      if (mesmoTurno(daTela, daFonte)) {
        continue;
      }

      if (
        correcao === -1 &&
        inicioNaTela + indice === ultimaDoAgente &&
        mesmoInstante(daTela, daFonte)
      ) {
        correcao = inicioNaTela + indice;
        continue;
      }

      sufixoConfere = false;
      break;
    }

    if (!sufixoConfere) {
      continue;
    }

    const prefixo = tela.slice(0, inicioNaTela).map(copiar);
    const meio = tela.slice(inicioNaTela, inicioNaTela + tamanho).map((turno, indice) => {
      if (inicioNaTela + indice === correcao) {
        return { ...copiar(turno), texto: fonte[indice]?.texto ?? turno.texto };
      }

      return copiar(turno);
    });
    const base = [...prefixo, ...meio];
    const novas = fonte
      .slice(tamanho)
      .filter((turno) => !jaEstaNaTela(base, turno))
      .map(copiar);

    return [...base, ...novas];
  }

  return [...tela.map(copiar), ...fonte.filter((turno) => !jaEstaNaTela(tela, turno)).map(copiar)];
}

export function mesclarTranscricao(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  if (fonte.length === 0) {
    return tela.map(copiar);
  }

  const comFerramentas = incorporarFerramentas(tela, fonte);

  if (comFerramentas.length === 0 || transcricaoInteiraDaFonte(comFerramentas, fonte)) {
    return fonte.map(copiar);
  }

  return mesclarFragmento(comFerramentas, fonte);
}

function corrigirUltimaFalaDoAgente(
  turnos: readonly TurnoDaTranscricao[],
  texto: string
) {
  const indice = indiceDaUltimaFalaDoAgente(turnos);

  if (indice < 0) {
    return turnos.map(copiar);
  }

  return turnos.map((turno, posicao) => {
    if (posicao !== indice) {
      return copiar(turno);
    }

    const linhas = turno.texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linhaDeFerramenta(linha));

    return { ...copiar(turno), texto: [texto, ...linhas].filter(Boolean).join('\n') };
  });
}

function acrescentarFala(
  turnos: readonly TurnoDaTranscricao[],
  locutor: TurnoDaTranscricao['locutor'],
  texto: string
) {
  if (turnos.some((turno) => turno.locutor === locutor && turno.texto === texto)) {
    return turnos.map(copiar);
  }

  return [...turnos.map(copiar), { locutor, quando: '—', texto }];
}

export const folgaParaAcompanharPx = 80;

export function acompanhaOFim(entrada: { altura: number; rolagem: number; visivel: number }) {
  return entrada.altura - entrada.rolagem - entrada.visivel <= folgaParaAcompanharPx;
}

export function aplicarEventoDaObservacao(
  atual: ObservacaoDaTranscricao,
  evento: EventoDaObservacao
): ObservacaoDaTranscricao {
  if (!atual.observando || evento.tipo === 'pronto' || evento.tipo === 'erro') {
    return {
      transcricao: atual.transcricao.map(copiar),
      observando: atual.observando
    };
  }

  if (evento.tipo === 'encerrada') {
    return {
      transcricao: atual.transcricao.map(copiar),
      observando: false
    };
  }

  if (evento.tipo === 'correcao') {
    return {
      transcricao: corrigirUltimaFalaDoAgente(atual.transcricao, evento.texto),
      observando: true
    };
  }

  return {
    transcricao: acrescentarFala(atual.transcricao, evento.locutor, evento.texto),
    observando: true
  };
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
