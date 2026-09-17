import assert from 'node:assert/strict';
import test from 'node:test';
import { atendimentoDaConversaElevenLabs } from '../../apps/api/src/modules/ingestao/elevenlabs.js';

test('ingestão mínima mapeia conversa ElevenLabs para Atendimento do HQ', () => {
  const atendimento = atendimentoDaConversaElevenLabs({
    conversation_id: 'conv-el-1',
    agent_id: 'affix-0800',
    agent_name: 'Clara Affix 0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    call_duration_secs: 312,
    transcript: [
      { role: 'agent', message: 'Olá, aqui é a Clara.' },
      { role: 'user', message: 'Preciso da rede credenciada.' }
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
  assert.equal(atendimento.transcricao.length, 2);
  assert.equal(atendimento.transcricao[0]?.locutor, 'Agente de Voz');
  assert.equal(atendimento.audio, '/media/conv-el-1.wav');
});

test('ingestão mínima ignora Agente de Voz que não pertence ao HQ', () => {
  assert.equal(
    atendimentoDaConversaElevenLabs({
      conversation_id: 'conv-el-x',
      agent_id: 'agente-desconhecido'
    }),
    undefined
  );
});
