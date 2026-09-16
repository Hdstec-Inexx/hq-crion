import type {
  AtendimentoListItem,
  EstadoDoCriterio
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
      estado,
      pontos: criterio.valor,
      critico: criterio.critico
    };
  });
}

function avaliacaoDe(nota: number, conferida: boolean) {
  return {
    nota,
    aprovacao: (nota >= reguaUnica.limiarDeAprovacao ? 'Aprovado' : 'Reprovado') as
      | 'Aprovado'
      | 'Reprovado',
    criterios: criteriosDaAvaliacao(conferida)
  };
}

function fatosInternos(item: AtendimentoListItem): Pick<
  RegistroDeAtendimento,
  'duracaoEmSegundos' | 'transferencia' | 'tempoDeEsperaEmSegundos' | 'ferramentas'
> {
  if (item.status !== 'Concluído') {
    return { tempoDeEsperaEmSegundos: 25 };
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

  return {
    ...item,
    audio: `/media/${item.id}.wav`,
    downloadDeAudio: `/media/${item.id}.wav`,
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
            ...(item.id === 'a2'
              ? { comentario: 'Rever o prompt de boleto na Clara Alter.' }
              : {})
          },
          curadorId: 'perfil-carla',
          ...(item.id === 'a2' ? { comentarioStatus: 'Pendente' as const } : {})
        }
      : {})
  };
}

export function catalogoDeAtendimentos() {
  return [...catalogoBase, ...extrasDoMes].map(detalheDe);
}
