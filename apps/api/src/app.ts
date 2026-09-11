import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import config from './plugins/config.js';
import modules from './plugins/modules.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await app.register(config);
  await app.register(cors, {
    origin: app.config.CORS_ORIGIN,
    methods: ['GET', 'HEAD'],
    credentials: false
  });
  await app.register(sensible);
  await app.register(modules);

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  return app;
}
