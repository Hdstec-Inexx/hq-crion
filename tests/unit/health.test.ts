import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../../apps/api/src/app.js';
import { healthResponseSchema } from '../../packages/contracts/src/health.js';

process.env.NODE_ENV = 'test';

test('GET /health responde sucesso pelo contrato HTTP, sem autenticação', async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.deepEqual(healthResponseSchema.parse(response.json()), {
      status: 'ok'
    });
  } finally {
    await app.close();
  }
});
