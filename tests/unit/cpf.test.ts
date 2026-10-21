import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extrairCpf,
  formatarCpf,
  normalizarCpf
} from '../../packages/contracts/src/cpf.js';
import {
  atendimentoListItemSchema,
  atendimentoDetalheSchema
} from '../../packages/contracts/src/atendimento.js';
import {
  camposVisiveisDaListagem,
  limparFiltrosDaQuery
} from '../../packages/contracts/src/filtros-listagem.js';

test('formatarCpf formata 11 dígitos para o padrão 000.000.000-00', () => {
  assert.equal(formatarCpf('12345678901'), '123.456.789-01');
  assert.equal(formatarCpf('123.456.789-01'), '123.456.789-01');
  assert.equal(formatarCpf('123'), '123');
});

test('normalizarCpf remove pontuação e espaços em branco', () => {
  assert.equal(normalizarCpf('123.456.789-01'), '12345678901');
  assert.equal(normalizarCpf(' 123.456.789-01 '), '12345678901');
  assert.equal(normalizarCpf('12345678901'), '12345678901');
  assert.equal(normalizarCpf('456.789'), '456789');
  assert.equal(normalizarCpf(undefined), '');
  assert.equal(normalizarCpf(null), '');
});

test('extrairCpf identifica CPF a partir de parâmetros da ferramenta consultar_cpf na transcrição', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Agente de Voz' as const,
        quando: '0:05',
        texto: 'Vou consultar seus dados.\n[Chamada de Ferramenta: consultar_cpf]',
        detalhes: [
          {
            tipo: 'Ferramenta' as const,
            nome: 'consultar_cpf',
            nomeDaFerramenta: 'consultar_cpf',
            parametros: '{"cpf":"52998224725"}'
          }
        ]
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('extrairCpf identifica CPF a partir da resposta da ferramenta consultar_cpf na transcrição', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Agente de Voz' as const,
        quando: '0:10',
        texto: '[Resultado da Ferramenta: consultar_cpf - Sucesso]',
        detalhes: [
          {
            tipo: 'Ferramenta' as const,
            nome: 'consultar_cpf',
            nomeDaFerramenta: 'consultar_cpf',
            resposta: '{"cpf":"529.982.247-25","nome":"Maria"}'
          }
        ]
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('extrairCpf identifica CPF a partir de ferramentas (array)', () => {
  const atendimento = {
    ferramentas: [
      {
        tool_name: 'consultar_cpf',
        parameters: { cpf: '52998224725' },
        success: true
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('extrairCpf prioriza detalhes da transcrição (Prioridade 1) sobre a coluna ferramentas (Prioridade 2) e extrai padrão em resposta de ferramenta', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Agente de Voz' as const,
        quando: '0:05',
        texto: '[Chamada de Ferramenta: buscar_beneficiario]',
        detalhes: [
          {
            tipo: 'Ferramenta' as const,
            nome: 'buscar_beneficiario',
            nomeDaFerramenta: 'buscar_beneficiario',
            resposta: '{"mensagem":"Titular localizado: 529.982.247-25"}'
          }
        ]
      }
    ],
    ferramentas: [
      {
        tool_name: 'consultar_cpf',
        parameters: { cpf: '11144477735' },
        success: true
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('extrairCpf prioriza consultar_cpf em ferramentas/detalhes sobre o texto da transcrição', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:02',
        texto: 'Meu CPF anterior era 111.111.111-11'
      },
      {
        locutor: 'Agente de Voz' as const,
        quando: '0:05',
        texto: 'Consultando.\n[Chamada de Ferramenta: consultar_cpf]',
        detalhes: [
          {
            tipo: 'Ferramenta' as const,
            nome: 'consultar_cpf',
            nomeDaFerramenta: 'consultar_cpf',
            parametros: '{"cpf":"52998224725"}'
          }
        ]
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('extrairCpf identifica padrão de CPF no texto da transcrição quando não houver ferramentas', () => {
  const comPontuacao = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:12',
        texto: 'Pode anotar meu CPF 529.982.247-25 por favor.'
      }
    ]
  };
  assert.equal(extrairCpf(comPontuacao), '529.982.247-25');

  const semPontuacao = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:12',
        texto: 'Meu CPF é 52998224725.'
      }
    ]
  };
  assert.equal(extrairCpf(semPontuacao), '529.982.247-25');
});

test('extrairCpf retorna undefined quando nenhum CPF for identificado', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:05',
        texto: 'Quero saber sobre o boleto.'
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), undefined);
});

test('extrairCpf não concatena números avulsos de JSON genérico sem chave de CPF', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Agente de Voz' as const,
        quando: '0:05',
        texto: '[Chamada de Ferramenta: enviar_notificacao]',
        detalhes: [
          {
            tipo: 'Ferramenta' as const,
            nome: 'enviar_notificacao',
            nomeDaFerramenta: 'enviar_notificacao',
            parametros: '{"telefone": "61999998888", "id": 123}'
          }
        ]
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), undefined);
});

test('extrairCpf não extrai telefone celular de 11 dígitos no texto livre se não houver indicativo de CPF', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:10',
        texto: 'Meu telefone para contato é 61988887777.'
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), undefined);
});

test('extrairCpf extrai telefone se estiver explicitamente rotulado como CPF', () => {
  const atendimento = {
    transcricao: [
      {
        locutor: 'Cliente' as const,
        quando: '0:10',
        texto: 'Meu CPF é 52998224725.'
      }
    ]
  };

  assert.equal(extrairCpf(atendimento), '529.982.247-25');
});

test('contratos de listagem e detalhe aceitam e expõem o campo cpf', () => {
  const item = {
    id: 'a1',
    administradora: 'Affix',
    agente: 'Clara Affix 0800',
    agenteId: 'affix-0800',
    iniciadoEm: '2026-10-11T09:12:00-03:00',
    motivo: 'Boleto',
    nota: 8.5,
    notaIa: 8.5,
    status: 'Concluído',
    curadoria: false,
    conversa: 'conv-a1',
    cpf: '529.982.247-25'
  };

  const parsedItem = atendimentoListItemSchema.parse(item);
  assert.equal(parsedItem.cpf, '529.982.247-25');

  const detalhe = {
    ...item,
    transcricao: []
  };

  const parsedDetalhe = atendimentoDetalheSchema.parse(detalhe);
  assert.equal(parsedDetalhe.cpf, '529.982.247-25');
});

test('camposVisiveisDaListagem inclui cpf para /atendimentos, /fila-de-curadoria, /minhas-curadorias e /curadorias-realizadas', () => {
  const rotasComCpf = [
    '/atendimentos',
    '/fila-de-curadoria',
    '/minhas-curadorias',
    '/curadorias-realizadas'
  ];

  for (const rota of rotasComCpf) {
    const campos = camposVisiveisDaListagem(rota);
    assert.ok(campos.includes('cpf'), `Rota ${rota} deve incluir o campo cpf`);
  }

  // Não deve incluir em favoritos ou manutenção
  assert.equal(camposVisiveisDaListagem('/favoritos').includes('cpf'), false);
  assert.equal(camposVisiveisDaListagem('/manutencao').includes('cpf'), false);
});

test('limparFiltrosDaQuery remove o parâmetro cpf', () => {
  const query = new URLSearchParams('inicio=2026-10-01&conversa=c1&cpf=529.982.247-25&motivo=Boleto');
  const limpa = limparFiltrosDaQuery(query);
  assert.equal(limpa.has('cpf'), false);
  assert.equal(limpa.get('cpf'), null);
});
