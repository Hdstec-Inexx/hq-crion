import fp from 'fastify-plugin';
import { z } from 'zod';

const optionalString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().optional()
);

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: optionalString,
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    DATABASE_URL: optionalString,
    SESSION_SECRET: optionalString,
    SKIP_SEED: z.preprocess((value) => value === 'true' || value === '1', z.boolean()),
    ELEVENLABS_API_KEY: optionalString,
    ELEVENLABS_BASE_URL: z.string().default('https://api.elevenlabs.io'),
    S3_BUCKET: optionalString,
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString
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
