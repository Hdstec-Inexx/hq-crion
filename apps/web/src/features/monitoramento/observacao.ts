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
  indiceDaChamada,
  type DetalheDaFerramenta,
  type IdentificacaoDaChamada,
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
  const todosDetalhesDaTela = tela.flatMap((item) => item.detalhes ?? []);

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
        ? { detalhes: detalhesComVereditoDaTela(todosDetalhesDaTela, daFonte.detalhes) }
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

function turnoProvisorioAbsorvido(
  turno: TurnoDaTranscricao,
  detalhesPresentes: readonly DetalheDaFerramenta[]
) {
  if (!turnoSoDeFerramenta(turno)) {
    return false;
  }

  return Boolean(
    turno.detalhes?.length &&
    turno.detalhes.every((d) => indiceDaChamada(detalhesPresentes, d) >= 0)
  );
}

function adotarFonte(
  tela: readonly TurnoDaTranscricao[],
  fonte: readonly TurnoDaTranscricao[]
) {
  const restantesDaTela = tela.flatMap((item) => item.detalhes ?? []);
  const base = fonte.map((turno) => {
    return {
      ...copiar(turno),
      ...(turno.detalhes?.length
        ? { detalhes: detalhesComVereditoDaTela(restantesDaTela, turno.detalhes) }
        : {})
    };
  });

  const detalhesDaBase = base.flatMap((item) => item.detalhes ?? []);

  for (const turno of tela) {
    if (falaCoberta(base, turno) || jaEstaNaTela(base, turno)) {
      continue;
    }

    if (turnoProvisorioAbsorvido(turno, detalhesDaBase)) {
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
    const todosDetalhesDaTela = tela.flatMap((item) => item.detalhes ?? []);
    const meio = tela.slice(inicioNaTela, inicioNaTela + tamanho).map((turno, indice) => {
      const daFonte = fonte[indice];

      if (inicioNaTela + indice === correcao) {
        return {
          ...copiar(turno),
          texto: daFonte?.texto ?? turno.texto,
          ...(daFonte?.detalhes?.length
            ? { detalhes: detalhesComVereditoDaTela(todosDetalhesDaTela, daFonte.detalhes) }
            : {})
        };
      }

      if (daFonte?.detalhes?.length) {
        return {
          ...copiar(turno),
          detalhes: detalhesComVereditoDaTela(todosDetalhesDaTela, daFonte.detalhes)
        };
      }

      return copiar(turno);
    });
    const base = [...prefixo, ...meio];
    const novas = fonte
      .slice(tamanho)
      .filter((turno) => !jaEstaNaTela(base, turno))
      .map(copiar);

    const resultadoFinal = [...base, ...novas];
    const detalhesPresentes = resultadoFinal.flatMap((t) =>
      turnoSoDeFerramenta(t) ? [] : t.detalhes ?? []
    );

    return resultadoFinal.filter((turno) => !turnoProvisorioAbsorvido(turno, detalhesPresentes));
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
    const todosDaTela = tela.flatMap((t) => t.detalhes ?? []);
    return fonte.map((turno) => {
      return {
        ...copiar(turno),
        ...(turno.detalhes?.length
          ? { detalhes: detalhesComVereditoDaTela(todosDaTela, turno.detalhes) }
          : {})
      };
    });
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

  return acrescentarChamada(turnos, detalhe, true);
}

function atualizarDetalhe(
  atual: DetalheDaFerramenta,
  novo: DetalheDaFerramenta
): DetalheDaFerramenta {
  return {
    ...atual,
    ...novo,
    ...(atual.veredito && !novo.veredito ? { veredito: atual.veredito } : {}),
    ...(atual.resposta && !novo.resposta ? { resposta: atual.resposta } : {})
  };
}

function alterarDetalheNoTurno(
  turnos: readonly TurnoDaTranscricao[],
  indice: number,
  operacao: (detalhe: DetalheDaFerramenta) => DetalheDaFerramenta | null
): TurnoDaTranscricao[] {
  let cursor = 0;

  return turnos.flatMap((turno) => {
    const detalhesDoTurno = turno.detalhes ?? [];
    const posicao = indice - cursor;
    cursor += detalhesDoTurno.length;

    if (posicao < 0 || posicao >= detalhesDoTurno.length) {
      return [copiar(turno)];
    }

    const detalheAtual = detalhesDoTurno[posicao];
    const novoDetalhe = detalheAtual ? operacao(detalheAtual) : null;

    if (!novoDetalhe) {
      const linha = detalheAtual ? textoDaChamadaDeFerramenta(detalheAtual.nomeDaFerramenta) : '';
      let removeuLinha = false;
      const texto = turno.texto
        .split('\n')
        .filter((item) => {
          if (!removeuLinha && item.trim() === linha) {
            removeuLinha = true;
            return false;
          }
          return true;
        })
        .join('\n')
        .trim();
      const restantes = detalhesDoTurno.filter((_, i) => i !== posicao);

      if (!texto) {
        return [];
      }

      return [
        {
          ...copiar(turno),
          texto,
          ...(restantes.length
            ? { detalhes: restantes.map((d) => ({ ...d })) }
            : { detalhes: undefined })
        }
      ];
    }

    return [
      {
        ...copiar(turno),
        detalhes: detalhesDoTurno.map((d, i) => (i === posicao ? { ...novoDetalhe } : { ...d }))
      }
    ];
  });
}

function acrescentarChamada(
  turnos: readonly TurnoDaTranscricao[],
  detalhe: DetalheDaFerramenta,
  emNovoTurno = false
) {
  const detalhes = turnos.flatMap((turno) => turno.detalhes ?? []);
  const indiceExistente = indiceDaChamada(detalhes, detalhe);

  if (indiceExistente >= 0) {
    return alterarDetalheNoTurno(turnos, indiceExistente, (atual) =>
      atualizarDetalhe(atual, detalhe)
    );
  }

  const linha = textoDaChamadaDeFerramenta(detalhe.nomeDaFerramenta);
  const ultimo = turnos.at(-1);
  const ultimoTemFalaDoAgente =
    ultimo?.locutor === 'Agente de Voz' && Boolean(falaDoTexto(ultimo.texto));

  if (emNovoTurno || !ultimoTemFalaDoAgente) {
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

function cancelarChamada(
  turnos: readonly TurnoDaTranscricao[],
  chamada: IdentificacaoDaChamada
) {
  const detalhes = turnos.flatMap((turno) => turno.detalhes ?? []);
  const indice = indiceDaChamada(detalhes, chamada);

  if (indice < 0) {
    return turnos.map(copiar);
  }

  return alterarDetalheNoTurno(turnos, indice, () => null);
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

  if (evento.tipo === 'cancelamento') {
    return {
      transcricao: cancelarChamada(atual.transcricao, evento.chamada),
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
