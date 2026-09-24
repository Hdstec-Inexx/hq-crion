import type { AtendimentoDetalhe, CriterioAvaliado } from '@hq-crion/contracts/atendimento';
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
  comentarioResolvidoEm?: string;
  duracaoEmSegundos?: number;
  transferencia?: boolean;
  tempoDeEsperaEmSegundos?: number;
  ferramentas?: FerramentasDoAtendimento;
};

export function aprovacaoDaNota(nota: number): 'Aprovado' | 'Reprovado' {
  return nota >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado';
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

function criterioDaRegua(criterio: CriterioAvaliado) {
  if (criterio.chave) {
    const porChave = reguaUnica.criterios.find((item) => item.chave === criterio.chave);

    if (!porChave || (criterio.nome && criterio.nome !== porChave.nome)) {
      return undefined;
    }

    return porChave;
  }

  return reguaUnica.criterios.find((item) => item.nome === criterio.nome);
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

  if (item.status !== 'Concluído' || !avaliacaoDaIaTemVeredito(item)) {
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
    comentarioResolvidoEm: _comentarioResolvidoEm,
    ...publico
  } = item;

  return publico;
}

