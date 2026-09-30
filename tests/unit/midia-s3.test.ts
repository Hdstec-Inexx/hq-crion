import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buscarMidiaNoS3,
  descobrirCaminhoNoS3,
  formatarEndpointS3,
  tipoDeMidiaPorChave
} from '../../apps/api/src/modules/midia/s3.js';
import { guardarMidiaLocal } from '../../apps/api/src/modules/midia/deposito.js';
import { camposDeMidia } from '../../apps/api/src/modules/atendimentos/registro.js';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';

test('formatarEndpointS3 garante protocolo http quando omitido', () => {
  assert.equal(formatarEndpointS3('minio:9000'), 'http://minio:9000');
  assert.equal(formatarEndpointS3('http://minio:9000/'), 'http://minio:9000');
  assert.equal(formatarEndpointS3('https://s3.example.com'), 'https://s3.example.com');
  assert.equal(formatarEndpointS3(undefined), undefined);
});

test('camposDeMidia normaliza nomes de arquivo para caminhos /media/', () => {
  assert.deepEqual(camposDeMidia('conv_123.mp3'), {
    audio: '/media/conv_123.mp3',
    downloadDeAudio: '/media/conv_123.mp3'
  });
  assert.deepEqual(camposDeMidia('/media/conv_123.wav'), {
    audio: '/media/conv_123.wav',
    downloadDeAudio: '/media/conv_123.wav'
  });
});

test('tipoDeMidiaPorChave detecta audio/mpeg para .mp3 e audio/wav para .wav', () => {
  assert.equal(tipoDeMidiaPorChave('conv_123.mp3'), 'audio/mpeg');
  assert.equal(tipoDeMidiaPorChave('conv_123.wav'), 'audio/wav');
  assert.equal(tipoDeMidiaPorChave('conv_123'), 'audio/wav');
});

test('buscarMidiaNoS3 encontra arquivo .mp3 e retorna audio/mpeg', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.input.Key === 'conv_123.mp3') {
        return {
          ContentType: 'audio/mpeg',
          Body: {
            transformToByteArray: async () => new Uint8Array([1, 2, 3, 4])
          }
        };
      }
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const midia = await buscarMidiaNoS3(mockS3 as any, 'hq-crion', 'conv_123');
  assert.ok(midia);
  assert.equal(midia?.tipo, 'audio/mpeg');
  assert.deepEqual(midia?.conteudo, Buffer.from([1, 2, 3, 4]));
});

test('descobrirCaminhoNoS3 encontra arquivo com extensão e retorna caminho relativo', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.input.Key === 'conv_2401m1hhmwk6f7db0nv869w62pmg.mp3') {
        return { ContentType: 'audio/mpeg' };
      }
      const erro = new Error('NotFound');
      (erro as any).name = 'NotFound';
      throw erro;
    }
  };

  const caminho = await descobrirCaminhoNoS3(
    mockS3 as any,
    'hq-crion',
    'conv_2401m1hhmwk6f7db0nv869w62pmg'
  );
  assert.equal(caminho, '/media/conv_2401m1hhmwk6f7db0nv869w62pmg.mp3');
});

test('descobrirCaminhoNoS3 recorre a GetObject se HeadObject for negado por política', async () => {
  const mockS3 = {
    send: async (command: any) => {
      // Se for HeadObjectCommand, simula recusa 403 / AccessDenied
      if (command.constructor.name === 'HeadObjectCommand') {
        const erro = new Error('AccessDenied');
        (erro as any).name = 'AccessDenied';
        throw erro;
      }
      if (command.input.Key === 'conv_policy.mp3') {
        return { Body: {} };
      }
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const caminho = await descobrirCaminhoNoS3(
    mockS3 as any,
    'hq-crion',
    'conv_policy'
  );
  assert.equal(caminho, '/media/conv_policy.mp3');
});

test('rota /media/:arquivo aceita .mp3 e serve com Content-Type audio/mpeg', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    guardarMidiaLocal('conv-mp3', {
      conteudo: Buffer.from('mp3-content'),
      tipo: 'audio/mpeg'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/media/conv-mp3.mp3',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(resposta.statusCode, 200);
    assert.equal(resposta.headers['content-type'], 'audio/mpeg');
    assert.deepEqual(resposta.rawPayload, Buffer.from('mp3-content'));
  } finally {
    await app.close();
  }
});

test('GET /atendimentos/:id descobre mídia por conversa quando o atendimento não tem áudio no banco', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    // Busca o atendimento 'a1' que tem conversa 'conv-1'
    const a1 = await app.atendimentos.buscarPorId('a1');
    assert.ok(a1);

    // Guarda mídia local usando a conversa 'conv-a1'
    guardarMidiaLocal('conv-a1', {
      conteudo: Buffer.from('audio-da-conversa'),
      tipo: 'audio/mpeg'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/atendimentos/a1',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(resposta.statusCode, 200);
    assert.equal(resposta.json().audio, '/media/conv-a1.mp3');
    assert.equal(resposta.json().downloadDeAudio, '/media/conv-a1.mp3');
  } finally {
    await app.close();
  }
});
