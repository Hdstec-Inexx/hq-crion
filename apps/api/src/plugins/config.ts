import fp from 'fastify-plugin';
import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().optional()
    ),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    CORS_ORIGIN: z.string().default('http://localhost:5173')
  })
  .transform((config) => ({
    ...config,
    HOST:
      config.HOST ??
      (config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
  }));

export type AppConfig = z.infer<typeof configSchema>;

export function parseAppConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
) {
  return configSchema.parse(env);
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export default fp(
  async (app) => {
    app.decorate('config', parseAppConfig(process.env));
  },
  { name: 'config' }
);
