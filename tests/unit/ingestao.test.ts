import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { avaliacaoDaIaTemVeredito } from '../../apps/api/src/modules/atendimentos/registro.js';
import {
  atendimentoDaFonteElevenLabs,
  coletarAtendimentosElevenLabs,
  leituraAoVivoDaFonte,
  listarConversasElevenLabs
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
  assert.equal(atendimento.custo, undefined);
  assert.equal(atendimento.transferencia, false);
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

test('ingestão sem o instante da fonte não grava o relógio atual', () => {
  assert.equal(
    atendimentoDaFonteElevenLabs({
      conversation_id: 'conv-sem-inicio',
      agent_id: 'affix-0800',
      status: 'done',
      start_time_unix_secs: 0
    }),
    undefined
  );
  const peloMetadata = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-metadata',
    agent_id: 'affix-0800',
    status: 'done',
    metadata: { start_time_unix_secs: 1_715_000_000 }
  });

  assert.equal(peloMetadata?.iniciadoEm, new Date(1_715_000_000 * 1000).toISOString());
});

test('turnos sem tempo na fonte não inventam Tempo de Espera', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-sem-tempo',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      { role: 'agent', message: 'Olá.' },
      { role: 'user', message: 'Oi.' },
      { role: 'agent', message: 'Diga.' }
    ]
  });

  assert.equal(atendimento?.tempoDeEsperaEmSegundos, undefined);
  assert.equal(atendimento?.transcricao[0]?.quando, '—');
  assert.equal(atendimento?.audio, undefined);
});

test('transcrição traz chamada e resultado da ferramenta na fala do turno', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-ferramenta',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou consultar seu plano.',
        time_in_call_secs: 8,
        tool_calls: [{ tool_name: 'consultar_plano', tool_call_id: 'c1' }],
        tool_results: [{ tool_call_id: 'c1', tool_name: 'consultar_plano', is_error: false }]
      }
    ]
  });

  assert.equal(atendimento?.transcricao.length, 1);
  assert.equal(atendimento?.transcricao[0]?.locutor, 'Agente de Voz');
  assert.equal(
    atendimento?.transcricao[0]?.texto,
    'Vou consultar seu plano.\n[Chamada de Ferramenta: consultar_plano]'
  );
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.nome, 'consultar_plano');
});

test('resultado completa o detalhe da chamada e não entra no turno seguinte', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-resultado-cliente',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou consultar seu plano.',
        time_in_call_secs: 8,
        tool_calls: [
          { tool_name: 'consultar_plano', tool_call_id: 'c1' },
          { tool_name: 'ocultar', tool_has_been_called: false }
        ]
      },
      {
        role: 'user',
        message: 'pode seguir',
        time_in_call_secs: 12,
        tool_results: [{ tool_call_id: 'c1', is_error: true }]
      }
    ]
  });

  assert.equal(
    atendimento?.transcricao[0]?.texto,
    'Vou consultar seu plano.\n[Chamada de Ferramenta: consultar_plano]\n[Chamada de Ferramenta: ocultar]'
  );
  assert.equal(atendimento?.transcricao[0]?.locutor, 'Agente de Voz');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, 'Falha');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[1]?.veredito, undefined);
  assert.equal(atendimento?.transcricao[1]?.texto, 'pode seguir');
  assert.equal(atendimento?.transcricao[1]?.detalhes, undefined);
  assert.equal(atendimento?.transcricao[1]?.locutor, 'Cliente');
});

test('ao vivo usa a mesma transcrição de ferramenta', () => {
  const leitura = leituraAoVivoDaFonte({
    conversation_id: 'conv-ao-vivo',
    agent_id: 'agent-fora',
    agent_name: 'Clara Affix',
    status: 'in-progress',
    transcript: [
      {
        role: 'agent',
        time_in_call_secs: 3,
        tool_calls: [{ tool_name: 'consultar_plano', tool_has_been_called: true }],
        tool_results: [{ tool_name: 'consultar_plano', status: 'failure' }]
      }
    ]
  });

  assert.equal(leitura?.transcricao[0]?.texto, '[Chamada de Ferramenta: consultar_plano]');
  assert.equal(leitura?.transcricao[0]?.detalhes?.[0]?.veredito, 'Falha');
});

test('nome alternativo e erro da fonte viram chamada e falha', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-apelidos',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Consultando.',
        time_in_call_secs: 2,
        tool_calls: [{ name: 'consultar_plano', tool_call_id: 'c1' }],
        tool_results: [{ tool_call_id: 'c1', error: 'timeout' }]
      },
      {
        role: 'agent',
        message: 'De novo.',
        time_in_call_secs: 4,
        tool_calls: [{ toolName: 'outra' }],
        tool_results: [{ toolName: 'outra', status: 'Falha' }]
      }
    ]
  });

  assert.equal(
    atendimento?.transcricao[0]?.texto,
    'Consultando.\n[Chamada de Ferramenta: consultar_plano]'
  );
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, 'Falha');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.resposta, 'timeout');
  assert.equal(atendimento?.transcricao[1]?.texto, 'De novo.\n[Chamada de Ferramenta: outra]');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.veredito, 'Falha');
});

test('turno só de ferramenta não entra no Tempo de Espera', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-espera-ferramenta',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      { role: 'agent', message: 'Olá.', time_in_call_secs: 0 },
      { role: 'user', message: 'Quero a rede.', time_in_call_secs: 5 },
      {
        role: 'agent',
        time_in_call_secs: 8,
        tool_calls: [{ tool_name: 'consultar_plano' }]
      },
      { role: 'agent', message: 'Encontrei.', time_in_call_secs: 20 }
    ]
  });

  assert.equal(atendimento?.transcricao[2]?.texto, '[Chamada de Ferramenta: consultar_plano]');
  assert.equal(atendimento?.tempoDeEsperaEmSegundos, 15);
});

test('ingestão não inventa Custo e só marca Transferência quando a ferramenta aparece na fonte', () => {
  const semFato = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-sem-custo',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000
  });
  const comFato = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-com-custo',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    metadata: { cost: 1.5 },
    transcript: [
      {
        role: 'agent',
        message: 'Vou transferir.',
        tool_calls: [{ tool_name: 'transfer_to_number' }]
      }
    ]
  });

  assert.equal(semFato?.custo, undefined);
  assert.equal(semFato?.transferencia, false);
  assert.equal(comFato?.custo, 'R$ 1,50');
  assert.equal(comFato?.transferencia, true);
  assert.equal(comFato?.transcricao[0]?.detalhes?.[0]?.tipo, 'Ferramenta');
  assert.equal(comFato?.transcricao[0]?.detalhes?.[0]?.nome, 'transfer_to_number');
});

test('parâmetros e resposta da ferramenta não passam do tamanho da fala', () => {
  const longo = 'x'.repeat(5_000);
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-detalhe-longo',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Consulto.',
        tool_calls: [{ tool_name: 'consultar_plano', tool_call_id: 'c1', params_as_json: longo }],
        tool_results: [{ tool_name: 'consultar_plano', tool_call_id: 'c1', result_value: longo }]
      }
    ]
  });

  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.parametros?.length, 4_096);
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.resposta?.length, 4_096);
});

test('Transferência só existe na ferramenta executada transfer_to_number', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-outro-transfer',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Sigo no fluxo.',
        tool_calls: [{ tool_name: 'transfer_to_agent' }]
      }
    ]
  });

  assert.equal(atendimento?.transferencia, false);
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.nome, 'transfer_to_agent');
});

test('turno só com tool_name transfer_to_number não é Transferência', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-tool-name-solto',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou transferir.',
        tool_name: 'transfer_to_number'
      }
    ]
  });

  assert.equal(atendimento?.transferencia, false);
});

test('transferência não executada não vira fato nem detalhe', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-transfer-parada',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou transferir.',
        tool_calls: [{ tool_name: 'transfer_to_number', tool_has_been_called: false, status: 'skipped' }]
      }
    ]
  });

  assert.equal(atendimento?.transferencia, false);
  assert.equal(atendimento?.transcricao[0]?.texto, 'Vou transferir.');
  assert.equal(atendimento?.transcricao[0]?.detalhes, undefined);
});

test('chamada pendente que recebe resultado cancelado posterior sai da transcrição', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-cancelamento-posterior',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Aguarde um instante.',
        tool_calls: [{ tool_name: 'consultar_plano', tool_call_id: 'c1' }]
      },
      {
        role: 'agent',
        message: 'Não consegui.',
        tool_results: [{ tool_call_id: 'c1', tool_name: 'consultar_plano', status: 'skipped' }]
      }
    ]
  });

  assert.equal(atendimento?.transcricao[0]?.texto, 'Aguarde um instante.');
  assert.equal(atendimento?.transcricao[0]?.detalhes, undefined);
  assert.equal(atendimento?.transcricao[1]?.texto, 'Não consegui.');
});

test('chamada aguardando retorno entra sem veredito', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-aguardando-retorno',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou consultar.',
        tool_calls: [{ tool_name: 'consultar_plano', tool_has_been_called: false }]
      }
    ]
  });

  assert.equal(
    atendimento?.transcricao[0]?.texto,
    'Vou consultar.\n[Chamada de Ferramenta: consultar_plano]'
  );
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, undefined);
  assert.equal(atendimento?.transferencia, false);
});

test('chamada ainda não marcada como executada aparece e o resultado cola depois', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-chamada-pendente',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Aguarde um instante enquanto verifico.',
        tool_calls: [
          {
            type: 'webhook',
            request_id: 'c1',
            tool_name: 'consultar_beneficiario',
            params_as_json: '{"telefone":"11999999999"}',
            tool_has_been_called: false
          }
        ]
      },
      {
        role: 'agent',
        message: 'Obrigada. Agora me confirme o nome.',
        tool_results: [
          {
            request_id: 'c1',
            tool_name: 'consultar_beneficiario',
            tool_has_been_called: true,
            is_error: false,
            result_value: '{"nome":"Maria"}'
          }
        ]
      }
    ]
  });

  assert.equal(
    atendimento?.transcricao[0]?.texto,
    'Aguarde um instante enquanto verifico.\n[Chamada de Ferramenta: consultar_beneficiario]'
  );
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.parametros, '{\n  "telefone": "11999999999"\n}');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.resposta, '{\n  "nome": "Maria"\n}');
  assert.equal(atendimento?.transcricao[1]?.texto, 'Obrigada. Agora me confirme o nome.');
  assert.equal(atendimento?.transcricao[1]?.detalhes, undefined);
});

test('resultado isolado na ingestão cria turno sem fala do agente de voz', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-resultado-isolado',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Aguarde um instante.',
        time_in_call_secs: 5
      },
      {
        role: 'agent',
        time_in_call_secs: 10,
        tool_results: [
          {
            request_id: 'iso-1',
            tool_name: 'consultar_cpf',
            is_error: false,
            result_value: '{"status":"regular"}'
          }
        ]
      }
    ]
  });

  assert.equal(atendimento?.transcricao.length, 2);
  assert.equal(atendimento?.transcricao[0]?.texto, 'Aguarde um instante.');
  assert.equal(
    atendimento?.transcricao[1]?.texto,
    '[Chamada de Ferramenta: consultar_cpf]'
  );
  assert.equal(atendimento?.transcricao[1]?.locutor, 'Agente de Voz');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.veredito, 'Sucesso');
});

test('procedimento mostra o nome da fonte e o resultado cola pelo índice', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-procedimento',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Vou consultar a rede.',
        time_in_call_secs: 17,
        conversation_turn_metrics: { convai_llm_service_ttfb: { elapsed_time: 1.3 } },
        reasoning: 'O agente escolheu a rede odontológica.',
        tool_calls: [
          {
            type: 'system',
            tool_name: 'start_procedure',
            params_as_json: '{"procedure_index":"7"}'
          },
          {
            type: 'system',
            tool_name: 'start_procedure',
            params_as_json: '{"procedure_index":"9"}'
          }
        ],
        tool_results: [
          {
            type: 'system',
            tool_name: 'start_procedure',
            tool_latency_secs: 0,
            result_value:
              '{"result_type":"start_procedure_success","procedure_index":"9","procedure_id":"agtprc_7101","procedure_name":"Consulta de Rede Odontológica"}'
          }
        ]
      },
      {
        role: 'agent',
        message: 'Encerro.',
        time_in_call_secs: 40,
        tool_calls: [{ tool_name: 'end_procedure', tool_call_id: 'fim' }]
      }
    ]
  });

  const detalhes = atendimento?.transcricao[0]?.detalhes;
  assert.equal(detalhes?.length, 2);
  assert.equal(detalhes?.[0]?.tipo, 'Procedimento');
  assert.equal(detalhes?.[0]?.nome, '7');
  assert.equal(detalhes?.[0]?.veredito, undefined);
  assert.equal(detalhes?.[0]?.tempoNoAtendimento, '0:17');
  assert.equal(detalhes?.[0]?.tempoDoLlm, '1,3 s');
  assert.equal(detalhes?.[0]?.raciocinio, 'O agente escolheu a rede odontológica.');
  assert.equal(detalhes?.[1]?.nome, 'Consulta de Rede Odontológica');
  assert.equal(detalhes?.[1]?.idDoProcedimento, 'agtprc_7101');
  assert.equal(detalhes?.[1]?.veredito, 'Sucesso');
  assert.equal(detalhes?.[1]?.tempoDeExecucao, '0 ms');
  assert.equal(detalhes?.[1]?.parametros, '{\n  "procedure_index": "9"\n}');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.acao, 'encerrou');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.nome, 'end_procedure');
});

test('fim de procedimento não completa o início que ainda está sem veredito', () => {
  const atendimento = atendimentoDaFonteElevenLabs({
    conversation_id: 'conv-fim-procedimento',
    agent_id: 'affix-0800',
    status: 'done',
    start_time_unix_secs: 1_715_000_000,
    transcript: [
      {
        role: 'agent',
        message: 'Começo.',
        tool_calls: [
          {
            tool_name: 'start_procedure',
            params_as_json: '{"procedure_id":"agtprc_1","procedure_name":"Rede"}'
          }
        ]
      },
      {
        role: 'agent',
        message: 'Termino.',
        tool_calls: [{ tool_name: 'end_procedure' }],
        tool_results: [
          {
            tool_name: 'end_procedure',
            result_value: '{"procedure_id":"agtprc_1","procedure_name":"Rede"}'
          }
        ]
      }
    ]
  });

  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.acao, 'iniciou');
  assert.equal(atendimento?.transcricao[0]?.detalhes?.[0]?.veredito, undefined);
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.acao, 'encerrou');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.veredito, 'Sucesso');
  assert.equal(atendimento?.transcricao[1]?.detalhes?.[0]?.nome, 'Rede');
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
              start_time_unix_secs: 1_715_000_000,
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

test('coleta percorre as páginas, busca o detalhe sem transcrição e limita o arquivo', async () => {
  const arquivo = Buffer.from('audio-mpeg');
  const chamadas: string[] = [];
  const coletados = await coletarAtendimentosElevenLabs({
    apiKey: 'chave',
    baseUrl: 'https://api.elevenlabs.io',
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input);
      chamadas.push(url);

      if (url.endsWith('/audio')) {
        if (url.includes('conv-falha')) {
          throw new Error('audio indisponível');
        }

        const grande = url.includes('conv-grande');
        return new Response(grande ? Buffer.alloc(64) : arquivo, {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
            ...(grande ? { 'content-length': String(30 * 1024 * 1024) } : {})
          }
        });
      }

      if (url.includes('/conversations/conv-resumo')) {
        return new Response(
          JSON.stringify({
            conversation_id: 'conv-resumo',
            agent_id: 'affix-0800',
            status: 'done',
            has_audio: true,
            start_time_unix_secs: 1_715_000_000,
            transcript: [
              { role: 'agent', message: 'Olá.', time_in_call_secs: 1 },
              { role: 'user', message: 'Preciso.', time_in_call_secs: 4 },
              { role: 'agent', message: 'Certo.', time_in_call_secs: 9 }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url.includes('cursor=pagina-2')) {
        return new Response(
          JSON.stringify({
            conversations: [
              {
                conversation_id: 'conv-pagina-2',
                agent_id: 'alter-1',
                status: 'in-progress',
                start_time_unix_secs: 1_715_000_000
              }
            ],
            has_more: false
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          conversations: [
            {
              conversation_id: 'conv-resumo',
              agent_id: 'affix-0800',
              status: 'done',
              start_time_unix_secs: 1_715_000_000
            },
            {
              conversation_id: 'conv-grande',
              agent_id: 'affix-wa',
              status: 'done',
              has_audio: true,
              start_time_unix_secs: 1_715_000_000,
              transcript: [{ role: 'agent', message: 'Grande.', time_in_call_secs: 1 }]
            },
            {
              conversation_id: 'conv-falha',
              agent_id: 'conecta-1',
              status: 'done',
              has_audio: true,
              start_time_unix_secs: 1_715_000_000,
              transcript: [{ role: 'agent', message: 'Segue.', time_in_call_secs: 1 }]
            }
          ],
          has_more: true,
          next_cursor: 'pagina-2'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch
  });
  const resumo = coletados.find((item) => item.id === 'conv-resumo');
  const grande = coletados.find((item) => item.id === 'conv-grande');
  const falha = coletados.find((item) => item.id === 'conv-falha');

  assert.equal(resumo?.transcricao[1]?.quando, '0:04');
  assert.equal(resumo?.tempoDeEsperaEmSegundos, 5);
  assert.equal(resumo?.audio, '/media/conv-resumo.wav');
  assert.equal(resumo?.tipoDaMidia, 'audio/mpeg');
  assert.ok(resumo?.midia && Buffer.compare(resumo.midia, arquivo) === 0);
  assert.equal(grande?.audio, undefined);
  assert.equal(falha?.audio, undefined);
  assert.ok(coletados.some((item) => item.id === 'conv-pagina-2'));
  assert.ok(chamadas.some((url) => url.includes('/conversations/conv-resumo')));
  assert.ok(chamadas.some((url) => url.includes('cursor=pagina-2')));
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
            start_time_unix_secs: 1_715_000_000,
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
            start_time_unix_secs: 1_715_000_000,
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

test('listagem da fonte segue a próxima página mesmo só com concluídos', async () => {
  const chamadas: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    chamadas.push(String(url));

    if (String(url).includes('cursor=pagina-2')) {
      return new Response(
        JSON.stringify({
          conversations: [{ conversation_id: 'conv-tarde', agent_id: 'affix-0800', status: 'in-progress' }],
          has_more: false
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        conversations: [{ conversation_id: 'conv-feita', agent_id: 'affix-0800', status: 'done' }],
        has_more: true,
        next_cursor: 'pagina-2'
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  const conversas = await listarConversasElevenLabs({
    apiKey: 'chave',
    baseUrl: 'https://api.elevenlabs.io',
    fetchImpl,
    maxPaginas: 5
  });

  assert.equal(conversas.length, 2);
  assert.equal(conversas[0]?.conversation_id, 'conv-feita');
  assert.equal(conversas[1]?.conversation_id, 'conv-tarde');
  assert.equal(chamadas.length, 2);
});
