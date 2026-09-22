import type { AtendimentoDetalhe } from '@hq-crion/contracts/atendimento';
import { reguaUnica } from '../regua/regua-unica.js';

export type FerramentasDoAtendimento = {
  executadas: number;
  sucesso: number;
};

export type RegistroDeAtendimento = AtendimentoDetalhe & {
  curadorId?: string;
  curadorNome?: string;
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
    curadorId: _curadorId,
    concluidoEm: _concluidoEm,
    comentarioStatus: _comentarioStatus,
    duracaoEmSegundos: _duracaoEmSegundos,
    transferencia: _transferencia,
    tempoDeEsperaEmSegundos: _tempoDeEsperaEmSegundos,
    ferramentas: _ferramentas,
    curadorNome: _curadorNome,
    comentarioId: _comentarioId,
    ...publico
  } = item;

  return publico;
}

