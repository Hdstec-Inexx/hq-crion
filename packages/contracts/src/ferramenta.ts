import { z } from 'zod';

export const detalheDaFerramentaSchema = z.object({
  tipo: z.enum(['Procedimento', 'Ferramenta']),
  acao: z.enum(['iniciou', 'encerrou']).optional(),
  nome: z.string().min(1),
  nomeDaFerramenta: z.string().min(1),
  id: z.string().min(1).optional(),
  idDoProcedimento: z.string().min(1).optional(),
  indiceDoProcedimento: z.string().min(1).optional(),
  raciocinio: z.string().min(1).optional(),
  parametros: z.string().min(1).optional(),
  tempoDeExecucao: z.string().min(1).optional(),
  resposta: z.string().min(1).optional(),
  veredito: z.enum(['Sucesso', 'Falha']).optional(),
  tempoNoAtendimento: z.string().min(1).optional(),
  tempoDoLlm: z.string().min(1).optional(),
  tipoDaFonte: z.string().min(1).optional()
});

export const resultadoDaChamadaSchema = z.object({
  id: z.string().min(1).optional(),
  nome: z.string().min(1),
  nomeDoProcedimento: z.string().min(1).optional(),
  idDoProcedimento: z.string().min(1).optional(),
  indiceDoProcedimento: z.string().min(1).optional(),
  veredito: z.enum(['Sucesso', 'Falha']),
  resposta: z.string().min(1).optional(),
  tempoDeExecucao: z.string().min(1).optional(),
  tipoDaFonte: z.string().min(1).optional(),
  raciocinio: z.string().min(1).optional()
});

export type DetalheDaFerramenta = z.infer<typeof detalheDaFerramentaSchema>;
export type ResultadoDaChamada = z.infer<typeof resultadoDaChamadaSchema>;

export function linhaDaChamada(detalhe: DetalheDaFerramenta) {
  if (detalhe.tipo === 'Procedimento') {
    const verbo = detalhe.acao === 'encerrou' ? 'encerrou' : 'iniciou';
    return `Agente de Voz ${verbo} o procedimento ${detalhe.nome}`;
  }

  return `Agente de Voz iniciou a ferramenta ${detalhe.nome}`;
}

export function rotulosDoDetalhe(detalhe: DetalheDaFerramenta) {
  const procedimento = detalhe.tipo === 'Procedimento';

  return {
    linha: linhaDaChamada(detalhe),
    nome: procedimento ? 'Nome do procedimento' : 'Nome da ferramenta',
    id: procedimento ? 'ID do procedimento' : 'ID da ferramenta',
    idExibido: procedimento ? detalhe.idDoProcedimento : detalhe.id,
    tipoDaFonte: detalhe.tipoDaFonte
      ? detalhe.tipoDaFonte === 'system'
        ? 'Resultado da ferramenta do sistema'
        : `Resultado da ferramenta ${detalhe.tipoDaFonte}`
      : undefined
  };
}

function primeiroSemVeredito(
  detalhes: readonly DetalheDaFerramenta[],
  aceita: (detalhe: DetalheDaFerramenta) => boolean
) {
  return detalhes.findIndex((detalhe) => !detalhe.veredito && aceita(detalhe));
}

function nomeDePareamento(detalhe: DetalheDaFerramenta) {
  return detalhe.nomeDaFerramenta || detalhe.nome;
}

function compativelComOResultado(detalhe: DetalheDaFerramenta, resultado: ResultadoDaChamada) {
  if (resultado.nome === 'start_procedure' || resultado.nome === 'end_procedure') {
    return nomeDePareamento(detalhe) === resultado.nome;
  }

  return true;
}

function resultadoDeProcedimento(resultado: ResultadoDaChamada) {
  return (
    Boolean(
      resultado.idDoProcedimento || resultado.indiceDoProcedimento || resultado.nomeDoProcedimento
    ) ||
    resultado.nome === 'start_procedure' ||
    resultado.nome === 'end_procedure'
  );
}

function indiceDoResultado(
  detalhes: readonly DetalheDaFerramenta[],
  resultado: ResultadoDaChamada
) {
  if (resultado.id) {
    return detalhes.findIndex((detalhe) => detalhe.id === resultado.id);
  }

  if (resultadoDeProcedimento(resultado)) {
    if (resultado.idDoProcedimento) {
      const peloId = primeiroSemVeredito(
        detalhes,
        (detalhe) =>
          detalhe.idDoProcedimento === resultado.idDoProcedimento &&
          compativelComOResultado(detalhe, resultado)
      );
      if (peloId >= 0) {
        return peloId;
      }
    }

    if (resultado.indiceDoProcedimento) {
      const peloIndice = primeiroSemVeredito(
        detalhes,
        (detalhe) =>
          detalhe.indiceDoProcedimento === resultado.indiceDoProcedimento &&
          compativelComOResultado(detalhe, resultado)
      );
      if (peloIndice >= 0) {
        return peloIndice;
      }
    }

    if (resultado.nomeDoProcedimento) {
      const peloNome = primeiroSemVeredito(
        detalhes,
        (detalhe) =>
          detalhe.tipo === 'Procedimento' &&
          detalhe.nome === resultado.nomeDoProcedimento &&
          compativelComOResultado(detalhe, resultado)
      );
      if (peloNome >= 0) {
        return peloNome;
      }
    }

    return primeiroSemVeredito(detalhes, (detalhe) => nomeDePareamento(detalhe) === resultado.nome);
  }

  return primeiroSemVeredito(
    detalhes,
    (detalhe) =>
      detalhe.tipo === 'Ferramenta' && nomeDePareamento(detalhe) === resultado.nome
  );
}

function completar(detalhe: DetalheDaFerramenta, resultado: ResultadoDaChamada): DetalheDaFerramenta {
  return {
    ...detalhe,
    ...(resultado.nomeDoProcedimento ? { nome: resultado.nomeDoProcedimento } : {}),
    ...(resultado.idDoProcedimento ? { idDoProcedimento: resultado.idDoProcedimento } : {}),
    ...(resultado.indiceDoProcedimento
      ? { indiceDoProcedimento: resultado.indiceDoProcedimento }
      : {}),
    ...(resultado.resposta ? { resposta: resultado.resposta } : {}),
    ...(resultado.tempoDeExecucao ? { tempoDeExecucao: resultado.tempoDeExecucao } : {}),
    ...(resultado.tipoDaFonte ? { tipoDaFonte: resultado.tipoDaFonte } : {}),
    ...(resultado.raciocinio ? { raciocinio: resultado.raciocinio } : {}),
    ...(resultado.nome === 'end_procedure' ? { acao: 'encerrou' as const } : {}),
    veredito: resultado.veredito
  };
}

export function conservarVereditoDaTela(
  daTela: DetalheDaFerramenta | undefined,
  daFonte: DetalheDaFerramenta
): DetalheDaFerramenta {
  if (!daTela?.veredito || daFonte.veredito) {
    return { ...daFonte };
  }

  return {
    ...daFonte,
    veredito: daTela.veredito,
    ...(daTela.resposta && !daFonte.resposta ? { resposta: daTela.resposta } : {}),
    ...(daTela.tempoDeExecucao && !daFonte.tempoDeExecucao
      ? { tempoDeExecucao: daTela.tempoDeExecucao }
      : {}),
    ...(daTela.idDoProcedimento && !daFonte.idDoProcedimento
      ? { idDoProcedimento: daTela.idDoProcedimento }
      : {}),
    ...(daTela.nome !== daTela.nomeDaFerramenta && daFonte.nome === daFonte.nomeDaFerramenta
      ? { nome: daTela.nome }
      : {})
  };
}

export function detalhesComVereditoDaTela(
  daTela: readonly DetalheDaFerramenta[] | undefined,
  daFonte: readonly DetalheDaFerramenta[]
) {
  return daFonte.map((fonte, indice) => {
    const tela =
      (fonte.id ? daTela?.find((item) => item.id === fonte.id) : undefined) ??
      (daTela && daTela.length === daFonte.length ? daTela[indice] : undefined);

    return conservarVereditoDaTela(tela, fonte);
  });
}

export function aplicarResultados<T extends { detalhes?: DetalheDaFerramenta[] }>(
  turnos: readonly T[],
  resultados: readonly ResultadoDaChamada[]
) {
  let detalhes = turnos.flatMap((turno) => turno.detalhes ?? []);

  for (const resultado of resultados) {
    const aplicado = aplicarResultado(detalhes, resultado);
    if (aplicado.aplicou) {
      detalhes = aplicado.detalhes;
    }
  }

  let cursor = 0;

  return turnos.map((turno) => {
    const quantidade = turno.detalhes?.length ?? 0;

    if (!quantidade) {
      return { ...turno };
    }

    const fatia = detalhes.slice(cursor, cursor + quantidade);
    cursor += quantidade;
    return { ...turno, detalhes: fatia };
  });
}

export function aplicarResultado(
  detalhes: readonly DetalheDaFerramenta[],
  resultado: ResultadoDaChamada
) {
  const indice = indiceDoResultado(detalhes, resultado);

  if (indice < 0) {
    return { detalhes: detalhes.map((detalhe) => ({ ...detalhe })), aplicou: false };
  }

  return {
    aplicou: true,
    detalhes: detalhes.map((detalhe, posicao) =>
      posicao === indice ? completar(detalhe, resultado) : { ...detalhe }
    )
  };
}
