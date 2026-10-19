import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { lerMidiaLocal } from '../../apps/api/src/modules/midia/deposito.js';
import { parseAppConfig } from '../../apps/api/src/plugins/config.js';
import {
  S3Client,
  buscarMidiaNoR2,
  chavesCandidatas,
  criarClienteR2,
  descobrirCaminhoNoR2,
  formatarEndpointR2,
  tipoDeMidiaPorChave
} from '../../apps/api/src/modules/midia/r2.js';

test('parseAppConfig carrega variáveis do Cloudflare R2 sem colidir com S3', () => {
  const config = parseAppConfig({
    R2_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
    R2_BUCKET: 'bucket-r2',
    R2_ACCESS_KEY_ID: 'r2-key-id',
    R2_SECRET_ACCESS_KEY: 'r2-secret-key',
    S3_ENDPOINT: 'http://s3.example.com',
    S3_BUCKET: 'bucket-s3',
    S3_ACCESS_KEY: 's3-key-id',
    S3_SECRET_KEY: 's3-secret-key'
  });

  assert.equal(config.R2_ENDPOINT, 'https://accountid.r2.cloudflarestorage.com');
  assert.equal(config.R2_BUCKET, 'bucket-r2');
  assert.equal(config.R2_ACCESS_KEY_ID, 'r2-key-id');
  assert.equal(config.R2_SECRET_ACCESS_KEY, 'r2-secret-key');

  assert.equal(config.S3_ENDPOINT, 'http://s3.example.com');
  assert.equal(config.S3_BUCKET, 'bucket-s3');
  assert.equal(config.S3_ACCESS_KEY, 's3-key-id');
  assert.equal(config.S3_SECRET_KEY, 's3-secret-key');
});

test('parseAppConfig trata campos vazios de R2 como undefined', () => {
  const config = parseAppConfig({
    R2_ENDPOINT: '   ',
    R2_BUCKET: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '   '
  });

  assert.equal(config.R2_ENDPOINT, undefined);
  assert.equal(config.R2_BUCKET, undefined);
  assert.equal(config.R2_ACCESS_KEY_ID, undefined);
  assert.equal(config.R2_SECRET_ACCESS_KEY, undefined);
});

test('formatarEndpointR2 garante protocolo https para endpoints Cloudflare R2', () => {
  assert.equal(
    formatarEndpointR2('accountid.r2.cloudflarestorage.com'),
    'https://accountid.r2.cloudflarestorage.com'
  );
  assert.equal(
    formatarEndpointR2('https://accountid.r2.cloudflarestorage.com/'),
    'https://accountid.r2.cloudflarestorage.com'
  );
  assert.equal(
    formatarEndpointR2('http://localhost:9000'),
    'http://localhost:9000'
  );
  assert.equal(formatarEndpointR2(undefined), undefined);
});

test('criarClienteR2 retorna undefined quando credenciais e endpoint não forem informados', () => {
  const clienteVazio = criarClienteR2({});
  assert.equal(clienteVazio, undefined);

  const clienteApenasBucket = criarClienteR2({ R2_BUCKET: 'bucket-isolado' });
  assert.equal(clienteApenasBucket, undefined);

  const clienteSoEndpoint = criarClienteR2({
    R2_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com'
  });
  assert.equal(clienteSoEndpoint, undefined);

  const clienteSoCredenciais = criarClienteR2({
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'secret-key'
  });
  assert.equal(clienteSoCredenciais, undefined);
});

test('criarClienteR2 instancia S3Client quando endpoint e credenciais forem informados', () => {
  const cliente = criarClienteR2({
    R2_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'key-id',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'meu-bucket'
  });
  assert.ok(cliente);
});

test('tipoDeMidiaPorChave atribui audio/mpeg para .mp3 e audio/wav para .wav', () => {
  assert.equal(tipoDeMidiaPorChave('conv_123.mp3'), 'audio/mpeg');
  assert.equal(tipoDeMidiaPorChave('conv_123.MP3'), 'audio/mpeg');
  assert.equal(tipoDeMidiaPorChave('atendimentos/conv_123.mp3'), 'audio/mpeg');
  assert.equal(tipoDeMidiaPorChave('conv_123.wav'), 'audio/wav');
  assert.equal(tipoDeMidiaPorChave('conv_123.WAV'), 'audio/wav');
  assert.equal(tipoDeMidiaPorChave('atendimentos/conv_123.wav'), 'audio/wav');
  assert.equal(tipoDeMidiaPorChave('conv_123'), 'audio/wav');
});

test('chavesCandidatas resolve chaves planas na raiz e sob atendimentos/', () => {
  const chaves = chavesCandidatas('conv_123');
  assert.ok(chaves.includes('atendimentos/conv_123.mp3'));
  assert.ok(chaves.includes('atendimentos/conv_123.wav'));
  assert.ok(chaves.includes('conv_123.mp3'));
  assert.ok(chaves.includes('conv_123.wav'));
  assert.equal(chaves.includes('conv_123'), false);

  const chavesPorIdSemPrefixo = chavesCandidatas('123');
  assert.ok(chavesPorIdSemPrefixo.includes('conv_123.mp3'));
  assert.ok(chavesPorIdSemPrefixo.includes('atendimentos/conv_123.mp3'));
  assert.ok(chavesPorIdSemPrefixo.includes('atendimentos/123.mp3'));

  const chavesComPrefixo = chavesCandidatas('atendimentos/conv_456.mp3');
  assert.ok(chavesComPrefixo.includes('atendimentos/conv_456.mp3'));
  assert.ok(chavesComPrefixo.includes('conv_456.mp3'));
  assert.ok(!chavesComPrefixo.includes('atendimentos/atendimentos/conv_456.mp3'));

  const chavesMaiusculas = chavesCandidatas('conv_789.MP3');
  assert.ok(chavesMaiusculas.includes('conv_789.MP3'));
});

test('buscarMidiaNoR2 localiza arquivo .mp3 no R2 e retorna bytes e tipo', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.input.Key === 'atendimentos/conv_123.mp3') {
        return {
          ContentType: 'audio/mpeg',
          Body: {
            transformToByteArray: async () => new Uint8Array([10, 20, 30])
          }
        };
      }
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const midia = await buscarMidiaNoR2(mockS3 as any, 'bucket-r2', 'conv_123');
  assert.ok(midia);
  assert.equal(midia?.tipo, 'audio/mpeg');
  assert.deepEqual(midia?.conteudo, Buffer.from([10, 20, 30]));
});

test('buscarMidiaNoR2 localiza arquivo .wav na raiz do R2', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.input.Key === 'conv_wav.wav') {
        return {
          ContentType: 'audio/wav',
          Body: {
            transformToByteArray: async () => new Uint8Array([50, 60])
          }
        };
      }
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const midia = await buscarMidiaNoR2(mockS3 as any, 'bucket-r2', 'conv_wav');
  assert.ok(midia);
  assert.equal(midia?.tipo, 'audio/wav');
  assert.deepEqual(midia?.conteudo, Buffer.from([50, 60]));
});

test('buscarMidiaNoR2 retorna undefined quando o arquivo não existe', async () => {
  const mockS3 = {
    send: async () => {
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const midia = await buscarMidiaNoR2(mockS3 as any, 'bucket-r2', 'conv_inexistente');
  assert.equal(midia, undefined);
});

test('descobrirCaminhoNoR2 localiza arquivo e retorna caminho relativo /media/', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.input.Key === 'atendimentos/conv_999.mp3') {
        return { ContentType: 'audio/mpeg' };
      }
      const erro = new Error('NotFound');
      (erro as any).name = 'NotFound';
      throw erro;
    }
  };

  const caminho = await descobrirCaminhoNoR2(mockS3 as any, 'bucket-r2', 'conv_999');
  assert.equal(caminho, '/media/conv_999.mp3');

  const mockS3Upper = {
    send: async (command: any) => {
      if (command.input.Key === 'conv_upper.MP3') {
        return { ContentType: 'audio/mpeg' };
      }
      const erro = new Error('NotFound');
      (erro as any).name = 'NotFound';
      throw erro;
    }
  };
  const caminhoUpper = await descobrirCaminhoNoR2(mockS3Upper as any, 'bucket-r2', 'conv_upper.MP3');
  assert.equal(caminhoUpper, '/media/conv_upper.mp3');
});

test('descobrirCaminhoNoR2 faz fallback para GetObject se HeadObject for negado por política', async () => {
  const mockS3 = {
    send: async (command: any) => {
      if (command.constructor?.name === 'HeadObjectCommand') {
        const erro = new Error('AccessDenied');
        (erro as any).name = 'AccessDenied';
        throw erro;
      }
      if (command.input?.Key === 'conv_policy.wav') {
        return { Body: {} };
      }
      const erro = new Error('NoSuchKey');
      (erro as any).name = 'NoSuchKey';
      throw erro;
    }
  };

  const caminho = await descobrirCaminhoNoR2(mockS3 as any, 'bucket-r2', 'conv_policy');
  assert.equal(caminho, '/media/conv_policy.wav');
});

test('descobrirCaminhoNoR2 retorna undefined quando o arquivo não existe', async () => {
  const mockS3 = {
    send: async () => {
      const erro = new Error('NotFound');
      (erro as any).name = 'NotFound';
      throw erro;
    }
  };

  const caminho = await descobrirCaminhoNoR2(mockS3 as any, 'bucket-r2', 'conv_nada');
  assert.equal(caminho, undefined);
});

test('GET /atendimentos/:id aponta caminho de áudio descoberto apenas no Cloudflare R2', async () => {
  const envAnterior = { ...process.env };
  process.env.R2_ENDPOINT = 'https://account-test.r2.cloudflarestorage.com';
  process.env.R2_BUCKET = 'bucket-r2-teste';
  process.env.R2_ACCESS_KEY_ID = 'chave-r2-teste';
  process.env.R2_SECRET_ACCESS_KEY = 'segredo-r2-teste';

  const sendOriginal = S3Client.prototype.send;
  (S3Client.prototype as any).send = async function (command: any) {
    if (
      command.input?.Bucket === 'bucket-r2-teste' &&
      command.input?.Key === 'atendimentos/conv-a2.mp3'
    ) {
      return { ContentType: 'audio/mpeg' };
    }
    const erro = new Error('NotFound');
    (erro as any).name = 'NotFound';
    throw erro;
  };

  try {
    const app = await buildApp();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
      });
      const sessao = loginResponseSchema.parse(login.json()).sessao;

      const resposta = await app.inject({
        method: 'GET',
        url: '/atendimentos/a2',
        headers: { authorization: `Bearer ${sessao}` }
      });

      assert.equal(resposta.statusCode, 200);
      const corpo = resposta.json();
      assert.equal(corpo.audio, '/media/conv-a2.mp3');
      assert.equal(corpo.downloadDeAudio, '/media/conv-a2.mp3');
    } finally {
      await app.close();
    }
  } finally {
    S3Client.prototype.send = sendOriginal;
    process.env = envAnterior;
  }
});

test('GET /media/:arquivo serve streaming do R2 sem re-hidratar o storage local', async () => {
  const envAnterior = { ...process.env };
  process.env.R2_ENDPOINT = 'https://account-test.r2.cloudflarestorage.com';
  process.env.R2_BUCKET = 'bucket-r2-teste';
  process.env.R2_ACCESS_KEY_ID = 'chave-r2-teste';
  process.env.R2_SECRET_ACCESS_KEY = 'segredo-r2-teste';

  const audioBytes = Buffer.from('conteudo-binario-do-r2');
  const sendOriginal = S3Client.prototype.send;
  (S3Client.prototype as any).send = async function (command: any) {
    if (
      command.input?.Bucket === 'bucket-r2-teste' &&
      command.input?.Key === 'atendimentos/conv-r2-stream.mp3'
    ) {
      return {
        ContentType: 'audio/mpeg',
        Body: {
          transformToByteArray: async () => new Uint8Array(audioBytes)
        }
      };
    }
    const erro = new Error('NoSuchKey');
    (erro as any).name = 'NoSuchKey';
    throw erro;
  };

  try {
    const app = await buildApp();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
      });
      const sessao = loginResponseSchema.parse(login.json()).sessao;

      // Confirma que não está no storage local antes
      assert.equal(lerMidiaLocal('conv-r2-stream'), undefined);

      const resposta = await app.inject({
        method: 'GET',
        url: '/media/conv-r2-stream.mp3',
        headers: { authorization: `Bearer ${sessao}` }
      });

      assert.equal(resposta.statusCode, 200);
      assert.equal(resposta.headers['content-type'], 'audio/mpeg');
      assert.deepEqual(resposta.rawPayload, audioBytes);

      // Confirma que NÃO re-hidratou no storage local após a resposta
      assert.equal(
        lerMidiaLocal('conv-r2-stream'),
        undefined,
        'O streaming obtido do R2 não deve re-hidratar o banco ou storage local'
      );
    } finally {
      await app.close();
    }
  } finally {
    S3Client.prototype.send = sendOriginal;
    process.env = envAnterior;
  }
});

test('GET /atendimentos/:id segue normalmente quando R2 falha com erro de rede', async () => {
  const envAnterior = { ...process.env };
  process.env.R2_ENDPOINT = 'https://account-test.r2.cloudflarestorage.com';
  process.env.R2_BUCKET = 'bucket-r2-teste';
  process.env.R2_ACCESS_KEY_ID = 'chave-r2-teste';
  process.env.R2_SECRET_ACCESS_KEY = 'segredo-r2-teste';

  const sendOriginal = S3Client.prototype.send;
  (S3Client.prototype as any).send = async function () {
    throw new Error('Cloudflare R2 Connection Reset');
  };

  try {
    const app = await buildApp();
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
      });
      const sessao = loginResponseSchema.parse(login.json()).sessao;

      const resposta = await app.inject({
        method: 'GET',
        url: '/atendimentos/a2',
        headers: { authorization: `Bearer ${sessao}` }
      });

      // Requisição não quebra e responde 200
      assert.equal(resposta.statusCode, 200);
    } finally {
      await app.close();
    }
  } finally {
    S3Client.prototype.send = sendOriginal;
    process.env = envAnterior;
  }
});

