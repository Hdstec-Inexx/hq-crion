import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canonicalizarMotivo,
  chaveCanonicaDoMotivo,
  motivosOficiaisDaClara,
  pontuacaoDeAcentos
} from '../../apps/api/src/modules/atendimentos/catalogo-motivos.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('chaveCanonicaDoMotivo normaliza por regex variações ortográficas, acentos, ordinais e pontuação', () => {
  assert.equal(chaveCanonicaDoMotivo('2ª via de boleto'), '2 via de boleto');
  assert.equal(chaveCanonicaDoMotivo('2 via de boleto'), '2 via de boleto');
  assert.equal(chaveCanonicaDoMotivo('2º via de boleto'), '2 via de boleto');
  assert.equal(
    chaveCanonicaDoMotivo('Alteração Cadastral/transferencia'),
    'alteracao cadastral transferencia'
  );
  assert.equal(
    chaveCanonicaDoMotivo('  Confirmação   de   Pagamento!  '),
    'confirmacao de pagamento'
  );
  assert.equal(
    chaveCanonicaDoMotivo('Emissão de documentos: carta de permanência...'),
    'emissao de documentos carta de permanencia'
  );
  assert.equal(chaveCanonicaDoMotivo(''), '');
  assert.equal(chaveCanonicaDoMotivo(null as unknown as string), '');
  assert.equal(chaveCanonicaDoMotivo(undefined as unknown as string), '');
});

test('catálogo oficial contém os 16 motivos canônicos da Clara', () => {
  assert.equal(motivosOficiaisDaClara.length, 16);
  assert.deepEqual([...motivosOficiaisDaClara], [
    'Pagamento no cartão',
    'Liberação de atendimento',
    'Alteração cadastral de endereço',
    'Alteração cadastral de nome e data de nascimento',
    'Negociação',
    'Consulta de carência',
    'Coparticipação e contestação',
    'Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira',
    'Reemissão de boleto',
    'Boleto',
    'Reajuste',
    'Inclusão de RN/RC',
    'Cancelamento de elegibilidade',
    'Confirmação de pagamento',
    'Boletos não gerados',
    'Atraso na liberação do código da carteirinha'
  ]);
});

test('canonicalizarMotivo mapeia variações ortográficas para os 16 motivos oficiais da Clara', () => {
  const casos: Array<[string, (typeof motivosOficiaisDaClara)[number]]> = [
    ['PAGAMENTO NO CARTÃO', 'Pagamento no cartão'],
    ['pagamento no cartao', 'Pagamento no cartão'],
    ['liberacao de atendimento', 'Liberação de atendimento'],
    ['LIBERAÇÃO DE ATENDIMENTO', 'Liberação de atendimento'],
    ['alteracao cadastral de endereco', 'Alteração cadastral de endereço'],
    [
      'alteracao cadastral de nome e data de nascimento',
      'Alteração cadastral de nome e data de nascimento'
    ],
    ['negociacao', 'Negociação'],
    ['NEGOCIAÇÃO', 'Negociação'],
    ['consulta de carencia', 'Consulta de carência'],
    ['CONSULTA DE CARÊNCIA', 'Consulta de carência'],
    ['coparticipacao e contestacao', 'Coparticipação e contestação'],
    [
      'emissao de documentos: carta de permanencia, demonstrativo, extrato de coparticipacao e ficha financeira',
      'Emissão de documentos: carta de permanência, demonstrativo, extrato de coparticipação e ficha financeira'
    ],
    ['reemissao de boleto', 'Reemissão de boleto'],
    ['boleto', 'Boleto'],
    ['BOLETO', 'Boleto'],
    ['  Boleto  ', 'Boleto'],
    ['reajuste', 'Reajuste'],
    ['inclusao de rn/rc', 'Inclusão de RN/RC'],
    ['INCLUSAO DE RN / RC', 'Inclusão de RN/RC'],
    ['cancelamento de elegibilidade', 'Cancelamento de elegibilidade'],
    ['confirmacao de pagamento', 'Confirmação de pagamento'],
    ['CONFIRMAÇÃO DE PAGAMENTO', 'Confirmação de pagamento'],
    ['boletos nao gerados', 'Boletos não gerados'],
    [
      'atraso na liberacao do codigo da carteirinha',
      'Atraso na liberação do código da carteirinha'
    ]
  ];

  for (const [variacao, esperado] of casos) {
    assert.equal(
      canonicalizarMotivo(variacao),
      esperado,
      `Variação "${variacao}" deveria ser canonicalizada para "${esperado}"`
    );
  }
});

test('canonicalizarMotivo aceita motivo inédito e não gera colisão indevida', () => {
  const inedito = 'Cancelamento de plano odontológico';
  assert.equal(canonicalizarMotivo(inedito), inedito);
  assert.equal(canonicalizarMotivo('  Cancelamento de plano odontológico  '), inedito);

  const motivosExistentes = ['2 via de boleto', inedito];

  assert.equal(
    canonicalizarMotivo('2ª via de boleto', motivosExistentes),
    '2 via de boleto'
  );
  assert.equal(
    canonicalizarMotivo('cancelamento de plano odontologico', motivosExistentes),
    inedito
  );

  // Não colide com palavras parciais ou motivos parecidos
  assert.equal(
    canonicalizarMotivo('Boleto vencido', motivosExistentes),
    'Boleto vencido'
  );
  assert.equal(
    canonicalizarMotivo('Boletos atrasados', motivosExistentes),
    'Boletos atrasados'
  );
});

test('migração 014_canonicalizar_motivos.sql define funções canônicas e trigger no PostgreSQL', () => {
  const sql = readFileSync(
    join(raiz, 'db/migrations/014_canonicalizar_motivos.sql'),
    'utf8'
  );

  assert.match(sql, /CREATE OR REPLACE FUNCTION hq_chave_canonica_motivo/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION hq_canonicalizar_motivo/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION hq_gatilho_canonicalizar_motivo/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF motivo ON hq_atendimento/i);

  for (const oficial of motivosOficiaisDaClara) {
    assert.ok(sql.includes(oficial), `SQL da migração deve conter o motivo oficial "${oficial}"`);
  }
});

test('pontuacaoDeAcentos conta corretamente caracteres acentuados e cedilhas', () => {
  assert.equal(pontuacaoDeAcentos('Transferencia Sac/Cobranca Duplicada'), 0);
  assert.equal(pontuacaoDeAcentos('Transferencia Sac/Cobrança Duplicada'), 1);
  assert.equal(pontuacaoDeAcentos('Transferência Sac/Cobrança Duplicada'), 2);
  assert.equal(pontuacaoDeAcentos('Cancelamento de elegibilidade'), 0);
  assert.equal(pontuacaoDeAcentos('Liberação de atendimento'), 2); // ã, ç
});

test('canonicalizarMotivo prioriza a variante com acentos e caracteres especiais', () => {
  const motivosComVariacoes = [
    'Transferencia Sac/Cobranca Duplicada',
    'Transferencia Sac/Cobrança Duplicada',
    'Transferência Sac/Cobrança Duplicada'
  ];

  // Chegando forma sem acento, mapeia para a mais rica com acentos
  assert.equal(
    canonicalizarMotivo('Transferencia Sac/Cobranca Duplicada', motivosComVariacoes),
    'Transferência Sac/Cobrança Duplicada'
  );

  // Chegando forma com acento inédita quando no banco só havia sem acento
  const bancoLegadoSemAcento = ['Transferencia Sac/Cancelamento'];
  assert.equal(
    canonicalizarMotivo('Transferência Sac/Cancelamento', bancoLegadoSemAcento),
    'Transferência Sac/Cancelamento'
  );
});

test('migração 015_canonicalizar_motivos_acentuados.sql define hq_pontuacao_acentos e consolidação com CTE', () => {
  const sql = readFileSync(
    join(raiz, 'db/migrations/015_canonicalizar_motivos_acentuados.sql'),
    'utf8'
  );

  assert.match(sql, /CREATE OR REPLACE FUNCTION hq_pontuacao_acentos/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION hq_canonicalizar_motivo/i);
  assert.match(sql, /hq_pontuacao_acentos\(motivo\)\s+DESC/i);
  assert.match(sql, /WITH melhores_motivos AS/i);
  assert.match(sql, /UPDATE hq_atendimento a/i);
});
