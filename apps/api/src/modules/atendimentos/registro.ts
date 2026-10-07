import {
  linhaDaRegua,
  notaDerivada,
  seloDaAvaliacao,
  type AtendimentoDetalhe,
  type CriterioAvaliado,
  type CriterioDaConferencia,
  type EstadoDoCriterio
} from '@hq-crion/contracts/atendimento';
import { reguaUnica } from '../regua/regua-unica.js';

export type FerramentasDoAtendimento = {
  executadas: number;
  sucesso: number;
};

export type CuradorDaRevisao = {
  id: string;
  nome: string;
};

export type RegistroDeAtendimento = AtendimentoDetalhe & {
  curadorDaRevisao?: CuradorDaRevisao;
  concluidoEm?: string;
  comentarioStatus?: 'Pendente' | 'Resolvido';
  comentarioId?: string;
  comentarioResolvidoPorId?: string;
  comentarioResolvidoPorNome?: string;
  comentarioResolvidoEm?: string;
  duracaoEmSegundos?: number;
  transferencia?: boolean;
  tempoDeEsperaEmSegundos?: number;
  ferramentas?: FerramentasDoAtendimento;
};

export function semTransferencia(item: { transferencia?: boolean }) {
  return item.transferencia !== true;
}

export function camposDeMidia(caminho: string | null | undefined) {
  if (!caminho || caminho.trim() === '') {
    return {};
  }

  const limpo = caminho.trim();
  if (/^https?:\/\//i.test(limpo)) {
    return { audio: limpo, downloadDeAudio: limpo };
  }
  const normalizado = limpo.startsWith('/') ? limpo : `/media/${limpo}`;
  return { audio: normalizado, downloadDeAudio: normalizado };
}

export function aprovacaoDaAvaliacao(
  nota: number,
  criterios: readonly { estado: EstadoDoCriterio; critico: boolean }[]
) {
  return seloDaAvaliacao(nota, reguaUnica.limiarDeAprovacao, criterios);
}

export function iaEstaAprovada(item: RegistroDeAtendimento) {
  if (!avaliacaoDaIaTemVeredito(item)) {
    return false;
  }

  const nota =
    typeof item.avaliacaoDaIa.nota === 'number' ? item.avaliacaoDaIa.nota : item.nota;

  return aprovacaoDaAvaliacao(nota, item.avaliacaoDaIa.criterios) === 'Aprovado';
}

export function montarConferencia(
  criteriosDaIa: readonly CriterioAvaliado[],
  enviados: readonly CriterioDaConferencia[]
): { nota: number; criterios: CriterioAvaliado[] } | undefined {
  if (enviados.length !== criteriosDaIa.length) {
    return undefined;
  }

  const usados = new Set<string>();
  const criterios: CriterioAvaliado[] = [];

  for (const enviado of enviados) {
    const daIa = criteriosDaIa.find((criterio) => criterio.nome === enviado.nome);

    if (!daIa || usados.has(daIa.nome)) {
      return undefined;
    }

    const daRegua = linhaDaRegua(reguaUnica.criterios, {
      nome: enviado.nome,
      ...(enviado.chave ? { chave: enviado.chave } : {})
    });

    if (!daRegua || daRegua.nome !== daIa.nome) {
      return undefined;
    }

    if (enviado.estado === 'Não se aplica' && !daRegua.admiteNaoSeAplica) {
      return undefined;
    }

    usados.add(daIa.nome);
    criterios.push({
      chave: daRegua.chave,
      nome: daRegua.nome,
      estado: enviado.estado,
      pontos: daRegua.valor,
      critico: daRegua.critico
    });
  }

  return {
    nota: notaDerivada(criterios),
    criterios
  };
}

export function recusaNaoSeAplica(criterios: readonly CriterioAvaliado[]) {
  return criterios.some((criterio) => {
    if (criterio.estado !== 'Não se aplica') {
      return false;
    }

    const daRegua = criterioDaRegua(criterio);
    return daRegua ? !daRegua.admiteNaoSeAplica : true;
  });
}

function criterioDaRegua(criterio: { chave?: string; nome: string }) {
  return linhaDaRegua(reguaUnica.criterios, criterio);
}

export function criteriosComChave(criterios: readonly CriterioAvaliado[]): CriterioAvaliado[] {
  return criterios.map((criterio) => {
    const daRegua = criterioDaRegua(criterio);
    return daRegua ? { ...criterio, chave: daRegua.chave, nome: daRegua.nome } : criterio;
  });
}

export function recusaDaAvaliacao(item: { status: string } | undefined) {
  if (!item) {
    return 'ausente' as const;
  }

  if (item.status !== 'Concluído') {
    return 'em-andamento' as const;
  }

  return undefined;
}

export function recusaDaConferencia(item: RegistroDeAtendimento | undefined) {
  if (!item) {
    return 'ausente' as const;
  }

  if (
    item.status !== 'Concluído' ||
    !avaliacaoDaIaTemVeredito(item) ||
    item.avaliacaoDoCurador
  ) {
    return 'indisponivel' as const;
  }

  return undefined;
}

export function avaliacaoDaIaTemVeredito(
  item: RegistroDeAtendimento
): item is RegistroDeAtendimento & {
  avaliacaoDaIa: NonNullable<RegistroDeAtendimento['avaliacaoDaIa']>;
} {
  return (
    item.avaliacaoDaIa?.criterios.some(
      (criterio) => criterio.estado === 'Atendido' || criterio.estado === 'Não atendido'
    ) ?? false
  );
}

export function detalhePublico(item: RegistroDeAtendimento): AtendimentoDetalhe {
  const {
    curadorDaRevisao: _curadorDaRevisao,
    concluidoEm: _concluidoEm,
    comentarioStatus: _comentarioStatus,
    duracaoEmSegundos: _duracaoEmSegundos,
    transferencia: _transferencia,
    tempoDeEsperaEmSegundos: _tempoDeEsperaEmSegundos,
    ferramentas: _ferramentas,
    comentarioId: _comentarioId,
    comentarioResolvidoPorId: _comentarioResolvidoPorId,
    comentarioResolvidoPorNome: _comentarioResolvidoPorNome,
    comentarioResolvidoEm: _comentarioResolvidoEm,
    ...publico
  } = item;

  return publico;
}

