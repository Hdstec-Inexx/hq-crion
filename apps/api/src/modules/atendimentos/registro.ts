import type { AtendimentoDetalhe } from '@hq-crion/contracts/atendimento';
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
  duracaoEmSegundos?: number;
  transferencia?: boolean;
  tempoDeEsperaEmSegundos?: number;
  ferramentas?: FerramentasDoAtendimento;
};

export function aprovacaoDaNota(nota: number): 'Aprovado' | 'Reprovado' {
  return nota >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado';
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
    ...publico
  } = item;

  return publico;
}

