import {
  falaDoTexto,
  linhasDeFerramentaNoTexto,
  textoDaChamadaDeFerramenta,
  textoSoDeFerramenta,
  type EventoDaObservacao,
  type TurnoDaTranscricao
} from '@hq-crion/contracts/atendimento';
import {
  aplicarResultados,
  detalheDoResultado,
  detalhesComVereditoDaTela,
  type DetalheDaFerramenta,
  type ResultadoDaChamada
} from '@hq-crion/contracts/ferramenta';

export type ObservacaoDaTranscricao = {
  transcricao: TurnoDaTranscricao[];
  observando: boolean;
};

function copiar(turno: TurnoDaTranscricao): TurnoDaTranscricao {
  return {
    locutor: turno.locutor,
    quando: turno.quando,
    texto: turno.texto,
    ...(turno.detalhes?.length ? { detalhes: turno.detalhes.map((detalhe) => ({ ...detalhe })) } : {})
  };
}

function turnoSoDeFerramenta(turno: TurnoDaTranscricao) {
  return textoSoDeFerramenta(turno.texto);
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

function textoGanhaFerramenta(atual: string, vindo: string) {
  if (!vindo.startsWith(atual)) {
    return false;
  }

  const resto = vindo.slice(atual.length).trim();
  return resto.length > 0 && linhasDeFerramentaNoTexto(resto).length === resto.split('\n').filter(Boolean).length;
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
        textoGanhaFerramenta(turno.texto, item.texto)
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
      quando: turno.quando === '—' ? daFonte.quando : turno.quando,
      ...(daFonte.detalhes?.length
        ? { detalhes: detalhesComVereditoDaTela(turno.detalhes, daFonte.detalhes) }
        : {})
    };
  });
}

function mesmoTurno(a: TurnoDaTranscricao, b: TurnoDaTranscricao) {
  return a.locutor === b.locutor && a.quando === b.quando && a.texto === b.texto;
}

function mesmoInstante(a: TurnoDaTranscricao, b: TurnoDaTranscricao) {
  return a.locutor === b.locutor && a.quando === b.quando;
}

function abreAMesmaFala(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  const daTela = tela[0];
  const daFonte = fonte[0];

  if (!daTela || !daFonte || daTela.locutor !== daFonte.locutor) {
    return false;
  }

  const falaDaTela = falaDoTexto(daTela.texto);
  const falaDaFonte = falaDoTexto(daFonte.texto);

  if (!falaDaTela || !falaDaFonte) {
    return false;
  }

  return (
    falaDaTela === falaDaFonte ||
    falaDaTela.startsWith(falaDaFonte) ||
    falaDaFonte.startsWith(falaDaTela)
  );
}

function falaCoberta(base: readonly TurnoDaTranscricao[], turno: TurnoDaTranscricao) {
  const fala = falaDoTexto(turno.texto);

  return base.some((item) => {
    if (item.locutor !== turno.locutor) {
      return false;
    }

    const daFonte = falaDoTexto(item.texto);
    return daFonte === fala || daFonte.startsWith(fala) || fala.startsWith(daFonte);
  });
}

function turnoComDetalheDaTela(
  copiado: TurnoDaTranscricao,
  daTela: TurnoDaTranscricao | undefined
) {
  if (!daTela?.detalhes?.length) {
    return copiado;
  }

  if (!copiado.detalhes?.length) {
    return { ...copiado, detalhes: daTela.detalhes.map((detalhe) => ({ ...detalhe })) };
  }

  return { ...copiado, detalhes: detalhesComVereditoDaTela(daTela.detalhes, copiado.detalhes) };
}

function adotarFonte(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  const base = fonte.map((turno) => {
    const daTela = tela.find(
      (item) => item.locutor === turno.locutor && falaDoTexto(item.texto) === falaDoTexto(turno.texto)
    );
    return turnoComDetalheDaTela(copiar(turno), daTela);
  });

  for (const turno of tela) {
    if (falaCoberta(base, turno) || jaEstaNaTela(base, turno)) {
      continue;
    }

    base.push(copiar(turno));
  }

  return base;
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
      const daFonte = fonte[indice];

      if (inicioNaTela + indice === correcao) {
        return {
          ...copiar(turno),
          texto: daFonte?.texto ?? turno.texto,
          ...(daFonte?.detalhes?.length
            ? { detalhes: detalhesComVereditoDaTela(turno.detalhes, daFonte.detalhes) }
            : {})
        };
      }

      if (daFonte?.detalhes?.length) {
        return {
          ...copiar(turno),
          detalhes: detalhesComVereditoDaTela(turno.detalhes, daFonte.detalhes)
        };
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
    return fonte.map((turno, indice) => turnoComDetalheDaTela(copiar(turno), comFerramentas[indice]));
  }

  if (abreAMesmaFala(comFerramentas, fonte)) {
    return adotarFonte(comFerramentas, fonte);
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

    const linhas = linhasDeFerramentaNoTexto(turno.texto);

    return {
      ...copiar(turno),
      texto: [texto, ...linhas].filter(Boolean).join('\n')
    };
  });
}

function completarResultado(turnos: readonly TurnoDaTranscricao[], resultado: ResultadoDaChamada) {
  const aplicado = aplicarResultados(turnos, [resultado]);

  if (aplicado.aplicou) {
    return aplicado.turnos.map(copiar);
  }

  const detalhe = detalheDoResultado(resultado);

  if (!detalhe) {
    return turnos.map(copiar);
  }

  return acrescentarChamada(turnos, detalhe);
}

function acrescentarChamada(turnos: readonly TurnoDaTranscricao[], detalhe: DetalheDaFerramenta) {
  const linha = textoDaChamadaDeFerramenta(detalhe.nomeDaFerramenta);
  const ultimo = turnos.at(-1);

  if (ultimo?.locutor !== 'Agente de Voz') {
    return [
      ...turnos.map(copiar),
      {
        locutor: 'Agente de Voz' as const,
        quando: '—',
        texto: linha,
        detalhes: [{ ...detalhe }]
      }
    ];
  }

  return turnos.map((turno, indice) => {
    if (indice !== turnos.length - 1) {
      return copiar(turno);
    }

    return {
      ...copiar(turno),
      texto: [turno.texto, linha].filter(Boolean).join('\n'),
      detalhes: [...(turno.detalhes ?? []).map((item) => ({ ...item })), { ...detalhe }]
    };
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

  if (evento.tipo === 'chamada') {
    return {
      transcricao: acrescentarChamada(atual.transcricao, evento.detalhe),
      observando: true
    };
  }

  if (evento.tipo === 'resultado') {
    return {
      transcricao: completarResultado(atual.transcricao, evento.resultado),
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
