import assert from 'node:assert/strict';
import test from 'node:test';
import { avaliacaoDaIaTemVeredito } from '../../apps/api/src/modules/atendimentos/registro.js';
import { inserirAtendimentoSeAusenteSql } from '../../apps/api/src/modules/atendimentos/schema.js';
import { atendimentoDaFonteElevenLabs } from '../../apps/api/src/modules/ingestao/elevenlabs.js';

test('ingestão mínima mapeia a fonte ElevenLabs para Atendimento do HQ sem inventar veredito da IA', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-el-1',
    agent_id: 'affix-0800',
    agent_name: 'Clara Affix 0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    call_duration_secs: 312,
    transcript: [
      { role: 'agent', message: 'Olá, aqui é a Clara.', time_in_call_secs: 1 },
      { role: 'user', message: 'Preciso da rede credenciada.', time_in_call_secs: 5 },
      { role: 'agent', message: 'Vou localizar.', time_in_call_secs: 9 }
    ]
  });

  assert.ok(atendimento);
  if (!atendimento) {
    return;
  }
  assert.equal(atendimento.id, 'conv-el-1');
  assert.equal(atendimento.conversa, 'conv-el-1');
  assert.equal(atendimento.agenteId, 'affix-0800');
  assert.equal(atendimento.agente, 'Clara Affix 0800');
  assert.equal(atendimento.administradora, 'Affix');
  assert.equal(atendimento.status, 'Concluído');
  assert.equal(atendimento.duracaoEmSegundos, 312);
  assert.equal(atendimento.transcricao.length, 3);
  assert.equal(atendimento.transcricao[0]?.locutor, 'Agente de Voz');
  assert.equal(atendimento.audio, '/media/conv-el-1.wav');
  assert.equal(atendimento.avaliacaoDaIa, undefined);
  assert.equal(avaliacaoDaIaTemVeredito(atendimento), false);
  assert.equal(atendimento.tempoDeEsperaEmSegundos, 4);
});

test('ingestão mínima ignora Agente de Voz que não pertence ao HQ', () => {
  assert.equal(
    atendimentoDaFonteElevenLabs({
      conversation_id: 'conv-el-x',
      agent_id: 'agente-desconhecido'
    }),
    undefined
  );
});

test('reingestão atualiza só status, transcrição, duração e Tempo de Espera', () => {
  assert.match(inserirAtendimentoSeAusenteSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  const atualizacao = inserirAtendimentoSeAusenteSql.slice(
    inserirAtendimentoSeAusenteSql.indexOf('DO UPDATE SET')
  );
  assert.match(atualizacao, /status/);
  assert.match(atualizacao, /transcricao/);
  assert.match(atualizacao, /duracao_em_segundos/);
  assert.match(atualizacao, /tempo_de_espera_em_segundos/);
  assert.doesNotMatch(atualizacao, /motivo/);
  assert.doesNotMatch(atualizacao, /custo/);
  assert.doesNotMatch(atualizacao, /transferencia/);
  assert.doesNotMatch(atualizacao, /ferramentas/);
  assert.doesNotMatch(atualizacao, /audio/);
  assert.doesNotMatch(atualizacao, /avaliacao/);
});
