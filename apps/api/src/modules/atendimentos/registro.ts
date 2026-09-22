import type { AtendimentoDetalhe } from '@hq-crion/contracts/atendimento';

export type FerramentasDoAtendimento = {
  executadas: number;
  sucesso: number;
};

export type RegistroDeAtendimento = AtendimentoDetalhe & {
  curadorId?: string;
  concluidoEm?: string;
  comentarioStatus?: 'Pendente' | 'Resolvido';
  duracaoEmSegundos?: number;
  transferencia?: boolean;
  tempoDeEsperaEmSegundos?: number;
  ferramentas?: FerramentasDoAtendimento;
};

export function avaliacaoDaIaTemVeredito(item: RegistroDeAtendimento) {
  return item.avaliacaoDaIa.criterios.some(
    (criterio) => criterio.estado === 'Atendido' || criterio.estado === 'Não atendido'
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
    ...publico
  } = item;

  return publico;
}

