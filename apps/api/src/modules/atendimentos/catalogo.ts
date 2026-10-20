import {
  seloDaAvaliacao,
  type AtendimentoListItem,
  type EstadoDoCriterio
} from '@hq-crion/contracts/atendimento';
import { periodoMesCivil } from '@hq-crion/contracts/recorte';
import { reguaUnica } from '../regua/regua-unica.js';
import type { RegistroDeAtendimento } from './registro.js';

function iniciadoNoMesCorrente(dia: number, hora: string) {
  const { inicio } = periodoMesCivil(new Date());
  const [ano, mes] = inicio.split('-');

  return `${ano}-${mes}-${String(Math.min(dia, 28)).padStart(2, '0')}T${hora}-03:00`;
}

const catalogoBase: AtendimentoListItem[] = [
  {
    id: 'a1',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: iniciadoNoMesCorrente(11, '09:12:00'),
    motivo: 'Rede credenciada',
    nota: 8.5,
    notaIa: 8.5,
    notaCurador: null,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-a1',
    custo: 'R$ 1,42'
  },
  {
    id: 'a2',
    administradora: 'Alter',
    agente: 'Clara Alter',
    agenteId: 'alter-1',
    iniciadoEm: iniciadoNoMesCorrente(11, '10:03:00'),
    motivo: 'Boleto',
    nota: 6.0,
    notaIa: 6.0,
    notaCurador: 6.0,
    status: 'Concluído',
    curadoria: true,
    conversa: 'conv-a2',
    custo: 'R$ 0,98'
  },
  {
    id: 'a3',
    administradora: 'Conectaplan',
    agente: 'Clara Conectaplan',
    agenteId: 'conecta-1',
    iniciadoEm: iniciadoNoMesCorrente(11, '11:40:00'),
    motivo: 'Não informado',
    nota: 9.0,
    notaIa: 9.0,
    notaCurador: null,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-a3',
    custo: 'R$ 1,10'
  },
  {
    id: 'a4',
    administradora: 'Affix',
    agente: 'Clara Affix WhatsApp',
    agenteId: 'affix-wa',
    iniciadoEm: iniciadoNoMesCorrente(11, '12:15:00'),
    motivo: 'Carência',
    nota: 7.5,
    notaIa: 7.5,
    notaCurador: null,
    status: 'Em andamento',
    curadoria: false,
    conversa: 'conv-a4',
    custo: 'R$ 0,40'
  },
  {
    id: 'a-fora',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: '2020-01-15T10:00:00-03:00',
    motivo: 'Carência',
    nota: 5,
    notaIa: 5,
    notaCurador: null,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-fora',
    custo: 'R$ 0,10'
  }
];

const { inicio: inicioDoMes } = periodoMesCivil(new Date());
const extrasDoMes: AtendimentoListItem[] = Array.from({ length: 47 }, (_, index) => {
  return {
    id: `extra-${index + 1}`,
    administradora: 'Conectaplan',
    agente: 'Clara Conectaplan',
    agenteId: 'conecta-1',
    iniciadoEm: `${inicioDoMes}T08:00:00-03:00`,
    motivo: 'Extra',
    nota: 8,
    notaIa: 8,
    notaCurador: null,
    status: 'Concluído',
    curadoria: false,
    conversa: `conv-extra-${index + 1}`,
    custo: 'R$ 0,01'
  };
});

function criteriosDaAvaliacao(conferida: boolean) {
  return reguaUnica.criterios.map((criterio) => {
    let estado: EstadoDoCriterio = 'Atendido';

    if (criterio.nome === 'Validação de e-mail') {
      estado = 'Não se aplica';
    } else if (conferida && criterio.nome === 'Informação de Protocolo') {
      estado = 'Não atendido';
    }

    return {
      nome: criterio.nome,
      chave: criterio.chave,
      estado,
      pontos: criterio.valor,
      critico: criterio.critico
    };
  });
}

function avaliacaoDe(nota: number, conferida: boolean) {
  const criterios = criteriosDaAvaliacao(conferida);
  return {
    nota,
    aprovacao: seloDaAvaliacao(nota, reguaUnica.limiarDeAprovacao, criterios),
    criterios,
    resumo: 'O cliente solicitou informações sobre o atendimento e obteve orientação conforme o procedimento operacional padrão.',
    falhasIdentificadas: conferida ? ['Informação de Protocolo não confirmada verbalmente no início do contato.'] : []
  };
}

function fatosInternos(item: AtendimentoListItem): Pick<
  RegistroDeAtendimento,
  'duracaoEmSegundos' | 'transferencia' | 'tempoDeEsperaEmSegundos' | 'ferramentas'
> {
  if (item.status !== 'Concluído') {
    return { tempoDeEsperaEmSegundos: 25, transferencia: false };
  }

  if (item.id === 'a1') {
    return {
      duracaoEmSegundos: 312,
      transferencia: false,
      tempoDeEsperaEmSegundos: 45,
      ferramentas: { executadas: 3, sucesso: 2 }
    };
  }

  if (item.id === 'a2') {
    return {
      duracaoEmSegundos: 198,
      transferencia: true,
      tempoDeEsperaEmSegundos: 90,
      ferramentas: { executadas: 2, sucesso: 1 }
    };
  }

  if (item.id === 'a-fora') {
    return {
      duracaoEmSegundos: 150,
      transferencia: false,
      tempoDeEsperaEmSegundos: 200,
      ferramentas: { executadas: 1, sucesso: 1 }
    };
  }

  return {
    duracaoEmSegundos: 120,
    transferencia: false,
    tempoDeEsperaEmSegundos: 30,
    ferramentas: { executadas: 1, sucesso: 1 }
  };
}

function detalheDe(item: AtendimentoListItem): RegistroDeAtendimento {
  const concluido = item.status === 'Concluído';

  if (item.id === 'a1') {
    return {
      ...item,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:04',
          texto: `Olá, aqui é a ${item.agente} da ${item.administradora}. Em que posso ajudar?`
        },
        {
          locutor: 'Cliente',
          quando: '0:12',
          texto:
            'Preciso falar sobre rede credenciada. O corretor me garantiu que o Hospital Santa Joana atendia pelo meu plano, mas quando precisei me disseram que não atende. Me sinto enganado pela venda. Já cancelei e migrei para a Hapvida.'
        },
        {
          locutor: 'Agente de Voz',
          quando: '0:22',
          texto:
            'Lamento muito pelo transtorno com a rede credenciada. Vou registrar o relato sobre o corretor e a migração para a Hapvida.'
        }
      ],
      avaliacaoDaIa: {
        ...avaliacaoDe(item.nota, item.curadoria),
        resumo:
          'O cliente relatou cancelamento e migração para a Hapvida motivado por divergência na rede credenciada prometida pelo corretor na adesão.'
      },
      ...fatosInternos(item),
      ...(concluido ? { concluidoEm: item.iniciadoEm } : {})
    };
  }

  if (item.id === 'a2') {
    return {
      ...item,
      transcricao: [
        {
          locutor: 'Agente de Voz',
          quando: '0:04',
          texto: `Olá, aqui é a ${item.agente} da ${item.administradora}. Em que posso ajudar?`
        },
        {
          locutor: 'Cliente',
          quando: '0:12',
          texto:
            'Estou com problema no boleto. O vendedor prometeu que não haveria cobrança de taxa de adesão no primeiro boleto. Foi uma venda mal feita e enganosa. Se não cancelarem essa taxa, vou cancelar o plano agora mesmo.'
        },
        {
          locutor: 'Agente de Voz',
          quando: '0:22',
          texto:
            'Compreendo a situação com o boleto. Vou verificar os detalhes do faturamento e da taxa acordada na adesão.'
        }
      ],
      avaliacaoDaIa: {
        ...avaliacaoDe(item.nota, item.curadoria),
        resumo:
          'O cliente contestou a cobrança no boleto alegando promessa comercial do vendedor e manifestou intenção de cancelamento por venda mal feita.'
      },
      ...fatosInternos(item),
      ...(concluido ? { concluidoEm: item.iniciadoEm } : {}),
      avaliacaoDoCurador: {
        ...avaliacaoDe(6, true),
        notaDaAvaliacaoDaIa: item.nota,
        curador: 'Carla Mendes',
        comentario: 'Rever o prompt de boleto na Clara Alter.'
      },
      curadorDaRevisao: { id: 'perfil-carla', nome: 'Carla Mendes' },
      comentarioStatus: 'Pendente' as const
    };
  }

  return {
    ...item,
    transcricao: [
      {
        locutor: 'Agente de Voz',
        quando: '0:04',
        texto: `Olá, aqui é a ${item.agente} da ${item.administradora}. Em que posso ajudar?`
      },
      {
        locutor: 'Cliente',
        quando: '0:12',
        texto: `Preciso falar sobre ${item.motivo.toLowerCase()}.`
      },
      {
        locutor: 'Agente de Voz',
        quando: '0:18',
        texto: 'Claro. Me confirma o CPF do titular para eu localizar o contrato.'
      }
    ],
    avaliacaoDaIa: avaliacaoDe(item.nota, item.curadoria),
    ...fatosInternos(item),
    ...(concluido ? { concluidoEm: item.iniciadoEm } : {}),
    ...(item.curadoria
      ? {
          avaliacaoDoCurador: {
            ...avaliacaoDe(6, true),
            notaDaAvaliacaoDaIa: item.nota,
            curador: 'Carla Mendes',
            ...(item.id === 'a2'
              ? { comentario: 'Rever o prompt de boleto na Clara Alter.' }
              : {})
          },
          curadorDaRevisao: { id: 'perfil-carla', nome: 'Carla Mendes' },
          ...(item.id === 'a2' ? { comentarioStatus: 'Pendente' as const } : {})
        }
      : {})
  };
}

export function catalogoDeAtendimentos() {
  return [...catalogoBase, ...extrasDoMes].map(detalheDe);
}
