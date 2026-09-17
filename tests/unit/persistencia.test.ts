import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAppConfig } from '../../apps/api/src/plugins/config.js';
import { fonteDePersistencia } from '../../apps/api/src/plugins/persistencia.js';
import { deveSemear } from '../../apps/api/src/modules/atendimentos/semente.js';

test('env de produção documenta banco Crion, CORS e skip de seed', () => {
  const config = parseAppConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://crion:secret@db.interno:5432/hq_crion',
    CORS_ORIGIN: 'https://hq.crion.example',
    SESSION_SECRET: 'segredo-de-producao',
    SKIP_SEED: 'true',
    ELEVENLABS_API_KEY: 'xi-key',
    S3_BUCKET: 'audios-crion'
  });

  assert.equal(config.DATABASE_URL, 'postgres://crion:secret@db.interno:5432/hq_crion');
  assert.equal(config.CORS_ORIGIN, 'https://hq.crion.example');
  assert.equal(config.SESSION_SECRET, 'segredo-de-producao');
  assert.equal(config.SKIP_SEED, true);
  assert.equal(config.ELEVENLABS_API_KEY, 'xi-key');
  assert.equal(config.S3_BUCKET, 'audios-crion');
  assert.equal(config.HOST, '0.0.0.0');
});

test('produção com DATABASE_URL usa o adapter Postgres, não o catálogo em memória', () => {
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://crion@db/hq_crion'
    }),
    'postgres'
  );
});

test('produção sem DATABASE_URL recusa o catálogo em memória', () => {
  assert.throws(
    () =>
      fonteDePersistencia({
        NODE_ENV: 'production'
      }),
    /DATABASE_URL/
  );
});

test('testes e desenvolvimento sem DATABASE_URL continuam na memória', () => {
  assert.equal(fonteDePersistencia({ NODE_ENV: 'test' }), 'memoria');
  assert.equal(fonteDePersistencia({ NODE_ENV: 'development' }), 'memoria');
  assert.equal(
    fonteDePersistencia({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://nao-usar-em-teste'
    }),
    'memoria'
  );
});

test('seed inicial é skippable e não se repete depois do primeiro boot', () => {
  assert.equal(deveSemear({ skipSeed: true, jaSemeado: false }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: true }), false);
  assert.equal(deveSemear({ skipSeed: false, jaSemeado: false }), true);
});
