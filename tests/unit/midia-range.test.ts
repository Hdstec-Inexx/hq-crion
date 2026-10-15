import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { loginResponseSchema } from '../../packages/contracts/src/perfil.js';
import { guardarMidiaLocal } from '../../apps/api/src/modules/midia/deposito.js';
import { extrairIntervaloDeBytes } from '../../apps/api/src/modules/midia/range.js';
import { S3Client } from '../../apps/api/src/modules/midia/r2.js';

test('extrairIntervaloDeBytes retorna invalido quando header Range é indefinido ou malformado', () => {
  assert.deepEqual(extrairIntervaloDeBytes(undefined, 1000), { tipo: 'invalido' });
  assert.deepEqual(extrairIntervaloDeBytes('', 1000), { tipo: 'invalido' });
  assert.deepEqual(extrairIntervaloDeBytes('characters=0-10', 1000), { tipo: 'invalido' });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=-', 1000), { tipo: 'invalido' });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=abc-def', 1000), { tipo: 'invalido' });
});

test('extrairIntervaloDeBytes extrai intervalo válido com start e end, limitando end ao total - 1', () => {
  assert.deepEqual(extrairIntervaloDeBytes('bytes=0-499', 1000), {
    tipo: 'intervalo',
    inicio: 0,
    fim: 499
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=100-200', 1000), {
    tipo: 'intervalo',
    inicio: 100,
    fim: 200
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=0-1500', 1000), {
    tipo: 'intervalo',
    inicio: 0,
    fim: 999
  });
});

test('extrairIntervaloDeBytes extrai intervalo aberto quando end é omitido', () => {
  assert.deepEqual(extrairIntervaloDeBytes('bytes=500-', 1000), {
    tipo: 'intervalo',
    inicio: 500,
    fim: 999
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=0-', 1000), {
    tipo: 'intervalo',
    inicio: 0,
    fim: 999
  });
});

test('extrairIntervaloDeBytes extrai sufixo de bytes quando start é omitido', () => {
  assert.deepEqual(extrairIntervaloDeBytes('bytes=-300', 1000), {
    tipo: 'intervalo',
    inicio: 700,
    fim: 999
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=-1500', 1000), {
    tipo: 'intervalo',
    inicio: 0,
    fim: 999
  });
});

test('extrairIntervaloDeBytes retorna insatisfativel para limites fora do arquivo', () => {
  assert.deepEqual(extrairIntervaloDeBytes('bytes=1000-1100', 1000), {
    tipo: 'insatisfativel'
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=1000-', 1000), {
    tipo: 'insatisfativel'
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=500-200', 1000), {
    tipo: 'insatisfativel'
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=-0', 1000), {
    tipo: 'insatisfativel'
  });
  assert.deepEqual(extrairIntervaloDeBytes('bytes=0-100', 0), {
    tipo: 'insatisfativel'
  });
});

test('GET /media/:arquivo sem Range responde 200 OK com Accept-Ranges: bytes e áudio integral', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const audioBytes = Buffer.from('audio-completo-de-teste-1234567890');
    guardarMidiaLocal('conv-teste-full', {
      conteudo: audioBytes,
      tipo: 'audio/mpeg'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/media/conv-teste-full.mp3',
      headers: { authorization: `Bearer ${sessao}` }
    });

    assert.equal(resposta.statusCode, 200);
    assert.equal(resposta.headers['content-type'], 'audio/mpeg');
    assert.equal(resposta.headers['accept-ranges'], 'bytes');
    assert.equal(Number(resposta.headers['content-length']), audioBytes.byteLength);
    assert.deepEqual(resposta.rawPayload, audioBytes);
  } finally {
    await app.close();
  }
});

test('GET /media/:arquivo com Range válido responde 206 Partial Content com fatia e headers', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const audioBytes = Buffer.from('0123456789abcdefghij'); // 20 bytes
    guardarMidiaLocal('conv-teste-range', {
      conteudo: audioBytes,
      tipo: 'audio/mpeg'
    });

    // 1. Fatia com start e end explícitos
    const resp1 = await app.inject({
      method: 'GET',
      url: '/media/conv-teste-range.mp3',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=0-9'
      }
    });

    assert.equal(resp1.statusCode, 206);
    assert.equal(resp1.headers['content-type'], 'audio/mpeg');
    assert.equal(resp1.headers['accept-ranges'], 'bytes');
    assert.equal(resp1.headers['content-range'], 'bytes 0-9/20');
    assert.equal(Number(resp1.headers['content-length']), 10);
    assert.deepEqual(resp1.rawPayload, audioBytes.subarray(0, 10));

    // 2. Fatia com start e end aberto
    const resp2 = await app.inject({
      method: 'GET',
      url: '/media/conv-teste-range.mp3',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=10-'
      }
    });

    assert.equal(resp2.statusCode, 206);
    assert.equal(resp2.headers['content-type'], 'audio/mpeg');
    assert.equal(resp2.headers['accept-ranges'], 'bytes');
    assert.equal(resp2.headers['content-range'], 'bytes 10-19/20');
    assert.equal(Number(resp2.headers['content-length']), 10);
    assert.deepEqual(resp2.rawPayload, audioBytes.subarray(10, 20));

    // 3. Fatia com end além do total (limitado ao total - 1)
    const resp3 = await app.inject({
      method: 'GET',
      url: '/media/conv-teste-range.mp3',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=15-100'
      }
    });

    assert.equal(resp3.statusCode, 206);
    assert.equal(resp3.headers['content-range'], 'bytes 15-19/20');
    assert.equal(Number(resp3.headers['content-length']), 5);
    assert.deepEqual(resp3.rawPayload, audioBytes.subarray(15, 20));
  } finally {
    await app.close();
  }
});

test('GET /media/:arquivo com Range insatisfatível responde 416 Range Not Satisfiable', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const audioBytes = Buffer.from('0123456789'); // 10 bytes
    guardarMidiaLocal('conv-teste-416', {
      conteudo: audioBytes,
      tipo: 'audio/wav'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/media/conv-teste-416.wav',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=50-100'
      }
    });

    assert.equal(resposta.statusCode, 416);
    assert.equal(resposta.headers['accept-ranges'], 'bytes');
    assert.equal(resposta.headers['content-range'], 'bytes */10');
  } finally {
    await app.close();
  }
});

test('GET /media/:arquivo sem autenticação responde 401 Unauthorized mesmo com Range', async () => {
  const app = await buildApp();

  try {
    const resposta = await app.inject({
      method: 'GET',
      url: '/media/qualquer-arquivo.mp3',
      headers: {
        range: 'bytes=0-10'
      }
    });

    assert.equal(resposta.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('GET /media/:arquivo rejeita path traversal e extensões não autorizadas', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const r1 = await app.inject({
      method: 'GET',
      url: '/media/arquivo.txt',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(r1.statusCode, 404);

    const r2 = await app.inject({
      method: 'GET',
      url: '/media/..%2Fsecret.mp3',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(r2.statusCode, 404);

    const r3 = await app.inject({
      method: 'GET',
      url: '/media/sub\\secret.mp3',
      headers: { authorization: `Bearer ${sessao}` }
    });
    assert.equal(r3.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('Curador autenticado realiza streaming com Range na rota /media/:arquivo', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'carla.mendes@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const audioBytes = Buffer.from('curador-streaming-seek-test');
    guardarMidiaLocal('conv-curador-stream', {
      conteudo: audioBytes,
      tipo: 'audio/wav'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/media/conv-curador-stream.wav',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=8-16'
      }
    });

    assert.equal(resposta.statusCode, 206);
    assert.equal(resposta.headers['content-type'], 'audio/wav');
    assert.equal(resposta.headers['accept-ranges'], 'bytes');
    assert.equal(resposta.headers['content-range'], `bytes 8-16/${audioBytes.byteLength}`);
    assert.equal(Number(resposta.headers['content-length']), 9);
    assert.deepEqual(resposta.rawPayload, audioBytes.subarray(8, 17));
  } finally {
    await app.close();
  }
});

test('GET /media/* com subcaminhos suporta Range e retorna 206', async () => {
  const app = await buildApp();

  try {
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'ana.souza@crion', senha: 'crion-hq' }
    });
    const sessao = loginResponseSchema.parse(login.json()).sessao;

    const audioBytes = Buffer.from('conteudo-wildcard-media');
    guardarMidiaLocal('subdiretorio/wildcard-media', {
      conteudo: audioBytes,
      tipo: 'audio/mpeg'
    });

    const resposta = await app.inject({
      method: 'GET',
      url: '/media/subdiretorio/wildcard-media.mp3',
      headers: {
        authorization: `Bearer ${sessao}`,
        range: 'bytes=0-7'
      }
    });

    assert.equal(resposta.statusCode, 206);
    assert.equal(resposta.headers['content-range'], `bytes 0-7/${audioBytes.byteLength}`);
    assert.deepEqual(resposta.rawPayload, audioBytes.subarray(0, 8));
  } finally {
    await app.close();
  }
});

test('GET /media/:arquivo com Range suporta streaming de áudio armazenado no Cloudflare R2', async () => {
  const envAnterior = { ...process.env };
  process.env.R2_ENDPOINT = 'https://account-test.r2.cloudflarestorage.com';
  process.env.R2_BUCKET = 'bucket-r2-teste';
  process.env.R2_ACCESS_KEY_ID = 'chave-r2-teste';
  process.env.R2_SECRET_ACCESS_KEY = 'segredo-r2-teste';

  const audioBytes = Buffer.from('audio-r2-seek-streaming-test-bytes');
  const sendOriginal = S3Client.prototype.send;
  (S3Client.prototype as any).send = async function (command: any) {
    if (
      command.input?.Bucket === 'bucket-r2-teste' &&
      command.input?.Key === 'atendimentos/conv-r2-range.mp3'
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

      const resposta = await app.inject({
        method: 'GET',
        url: '/media/conv-r2-range.mp3',
        headers: {
          authorization: `Bearer ${sessao}`,
          range: 'bytes=9-20'
        }
      });

      assert.equal(resposta.statusCode, 206);
      assert.equal(resposta.headers['content-type'], 'audio/mpeg');
      assert.equal(resposta.headers['accept-ranges'], 'bytes');
      assert.equal(resposta.headers['content-range'], `bytes 9-20/${audioBytes.byteLength}`);
      assert.equal(Number(resposta.headers['content-length']), 12);
      assert.deepEqual(resposta.rawPayload, audioBytes.subarray(9, 21));
    } finally {
      await app.close();
    }
  } finally {
    S3Client.prototype.send = sendOriginal;
    process.env = envAnterior;
  }
});
