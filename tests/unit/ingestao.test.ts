import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { avaliacaoDaIaTemVeredito } from '../../apps/api/src/modules/atendimentos/registro.js';
import { inserirAtendimentoSeAusenteSql } from '../../apps/api/src/modules/atendimentos/schema.js';
import {
  atendimentoDaFonteElevenLabs,
  coletarAtendimentosElevenLabs
} from '../../apps/api/src/modules/ingestao/elevenlabs.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';

process.env.NODE_ENV = 'test';

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
  assert.equal(atendimento.transcricao[0]?.quando, '0:01');
  assert.equal(atendimento.audio, undefined);
  assert.equal(atendimento.downloadDeAudio, undefined);
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

test('turnos sem tempo na fonte não inventam Tempo de Espera', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-sem-tempo',
    agent_id: 'affix-0800',
    status: 'done',
    transcript: [
      { role: 'agent', message: 'Olá.' },
      { role: 'user', message: 'Oi.' },
      { role: 'agent', message: 'Diga.' }
    ]
  });

  assert.equal(atendimento?.tempoDeEsperaEmSegundos, undefined);
  assert.equal(atendimento?.audio, undefined);
});

test('reingestão grava o áudio quando a fonte manda o arquivo e não apaga o que já existe', () => {
  assert.match(inserirAtendimentoSeAusenteSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  const atualizacao = inserirAtendimentoSeAusenteSql.slice(
    inserirAtendimentoSeAusenteSql.indexOf('DO UPDATE SET')
  );
  assert.match(atualizacao, /status/);
  assert.match(atualizacao, /transcricao/);
  assert.match(
    atualizacao,
    /duracao_em_segundos = COALESCE\(EXCLUDED\.duracao_em_segundos, hq_atendimento\.duracao_em_segundos\)/
  );
  assert.match(
    atualizacao,
    /tempo_de_espera_em_segundos = COALESCE\(\s*EXCLUDED\.tempo_de_espera_em_segundos,\s*hq_atendimento\.tempo_de_espera_em_segundos\s*\)/
  );
  assert.match(
    atualizacao,
    /audio = COALESCE\(EXCLUDED\.audio, hq_atendimento\.audio\)/
  );
  assert.doesNotMatch(atualizacao, /motivo/);
  assert.doesNotMatch(atualizacao, /custo/);
  assert.doesNotMatch(atualizacao, /transferencia/);
  assert.doesNotMatch(atualizacao, /ferramentas/);
  assert.doesNotMatch(atualizacao, /avaliacao/);
});

test('coleta grava o arquivo da fonte e omite o caminho quando ele não vem', async () => {
  const arquivo = Buffer.from('audio-da-fonte');
  const coletados = await coletarAtendimentosElevenLabs({
    apiKey: 'chave',
    baseUrl: 'https://api.elevenlabs.io',
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/audio')) {
        return new Response(arquivo, {
          status: 200,
          headers: { 'content-type': 'audio/wav' }
        });
      }

      return new Response(
        JSON.stringify({
          conversations: [
            {
              conversation_id: 'conv-com-audio',
              agent_id: 'affix-0800',
              status: 'done',
              has_audio: true,
              call_duration_secs: 12,
              transcript: [
                { role: 'agent', message: 'Olá.', time_in_call_secs: 1 },
                { role: 'user', message: 'Preciso.', time_in_call_secs: 5 },
                { role: 'agent', message: 'Certo.', time_in_call_secs: 9 }
              ]
            },
            {
              conversation_id: 'conv-sem-audio',
              agent_id: 'alter-1',
              status: 'done',
              has_audio: false,
              transcript: [{ role: 'agent', message: 'Sem arquivo.', time_in_call_secs: 1 }]
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch
  });
  const comAudio = coletados.find((item) => item.id === 'conv-com-audio');
  const semAudio = coletados.find((item) => item.id === 'conv-sem-audio');

  assert.equal(comAudio?.audio, '/media/conv-com-audio.wav');
  assert.equal(comAudio?.downloadDeAudio, '/media/conv-com-audio.wav');
  assert.ok(comAudio?.midia && Buffer.compare(comAudio.midia, arquivo) === 0);
  assert.equal(comAudio?.avaliacaoDaIa, undefined);
  assert.equal(comAudio?.tempoDeEsperaEmSegundos, 4);
  assert.equal(semAudio?.audio, undefined);
  assert.equal(semAudio?.midia, undefined);
});

test('HTTP da ingestão serve o arquivo e não inventa mídia nem Avaliação da IA', async () => {
  const arquivo = Buffer.from('audio-da-fonte');
  const fetchOriginal = globalThis.fetch;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  process.env.ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/audio')) {
      return new Response(arquivo, {
        status: 200,
        headers: { 'content-type': 'audio/wav' }
      });
    }

    return new Response(
      JSON.stringify({
        conversations: [
          {
            conversation_id: 'conv-com-audio',
            agent_id: 'affix-0800',
            agent_name: 'Clara Affix 0800',
            status: 'done',
            has_audio: true,
            start_time_unix_secs: 1_715_000_000,
            call_duration_secs: 12,
            transcript: [
              { role: 'agent', message: 'Olá.', time_in_call_secs: 1 },
              { role: 'user', message: 'Preciso.', time_in_call_secs: 5 },
              { role: 'agent', message: 'Certo.', time_in_call_secs: 9 }
            ]
          },
          {
            conversation_id: 'conv-sem-audio',
            agent_id: 'alter-1',
            status: 'done',
            has_audio: false,
            transcript: [
              { role: 'agent', message: 'Apresentação.' },
              { role: 'user', message: 'Oi.' },
              { role: 'agent', message: 'Diga.' }
            ]
          },
          {
            conversation_id: 'a1',
            agent_id: 'affix-0800',
            status: 'done',
            has_audio: false,
            transcript: [{ role: 'agent', message: 'Reingestão sem veredito.', time_in_call_secs: 1 }]
          }
        ]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'bruno.alves@crion', senha: 'crion-hq' }
    });
    const admin = loginResponseSchema.parse(login.json()).sessao;
    const curadorLogin = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });
    const curador = loginResponseSchema.parse(curadorLogin.json()).sessao;
    const comAudio = await app.inject({
      method: 'GET',
      url: '/atendimentos/conv-com-audio',
      headers: { authorization: `Bearer ${admin}` }
    });
    const semAudio = await app.inject({
      method: 'GET',
      url: '/atendimentos/conv-sem-audio',
      headers: { authorization: `Bearer ${admin}` }
    });
    const midia = await app.inject({
      method: 'GET',
      url: '/media/conv-com-audio.wav',
      headers: { authorization: `Bearer ${admin}` }
    });
    const midiaCurador = await app.inject({
      method: 'GET',
      url: '/media/conv-com-audio.wav',
      headers: { authorization: `Bearer ${curador}` }
    });
    const midiaSemSessao = await app.inject({
      method: 'GET',
      url: '/media/conv-com-audio.wav'
    });
    const curadorNoDetalhe = await app.inject({
      method: 'GET',
      url: '/atendimentos/conv-com-audio',
      headers: { authorization: `Bearer ${curador}` }
    });
    const reingestao = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${admin}` }
    });

    assert.equal(comAudio.statusCode, 200, comAudio.body);
    assert.equal(comAudio.json().audio, '/media/conv-com-audio.wav');
    assert.equal(comAudio.json().downloadDeAudio, '/media/conv-com-audio.wav');
    assert.equal('avaliacaoDaIa' in comAudio.json(), false);
    assert.equal(comAudio.json().transcricao[1].quando, '0:05');
    assert.equal(semAudio.statusCode, 200, semAudio.body);
    assert.equal('audio' in semAudio.json(), false);
    assert.equal('downloadDeAudio' in semAudio.json(), false);
    assert.equal(midia.statusCode, 200, midia.body);
    assert.equal(midia.headers['content-type'], 'audio/wav');
    assert.equal(Buffer.compare(midia.rawPayload, arquivo), 0);
    assert.equal(midiaCurador.statusCode, 200);
    assert.equal(midiaSemSessao.statusCode, 401);
    assert.equal(curadorNoDetalhe.json().audio, '/media/conv-com-audio.wav');
    assert.equal('downloadDeAudio' in curadorNoDetalhe.json(), false);
    assert.equal(reingestao.statusCode, 200, reingestao.body);
    assert.equal(reingestao.json().avaliacaoDaIa.nota, 8.5);
    assert.ok(
      reingestao.json().transcricao.some(
        (turno: { texto: string }) => turno.texto === 'Reingestão sem veredito.'
      )
    );
  } finally {
    await app.close();
    delete process.env.ELEVENLABS_API_KEY;
    globalThis.fetch = fetchOriginal;
  }
});
