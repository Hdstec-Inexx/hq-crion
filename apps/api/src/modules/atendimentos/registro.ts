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
