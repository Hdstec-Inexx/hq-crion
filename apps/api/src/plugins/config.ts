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
    DEPOSITO: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.enum(['postgres']).optional()
    ),
    SESSION_SECRET: optionalString,
    SKIP_SEED: z.preprocess((value) => value === 'true' || value === '1', z.boolean()),
    ELEVENLABS_API_KEY: optionalString,
    ELEVENLABS_BASE_URL: z
      .string()
      .default('https://api.elevenlabs.io')
      .refine((value) => {
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'ELEVENLABS_BASE_URL deve ser https'),
    S3_BUCKET: optionalString,
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY: optionalString,
    S3_SECRET_KEY: optionalString,
    STORAGE_PROVIDER: optionalString,
    STORAGE_BUCKET: optionalString,
    STORAGE_ENDPOINT: optionalString,
    STORAGE_ACCESS_KEY: optionalString,
    STORAGE_SECRET_KEY: optionalString,
    STORAGE_PUBLIC_URL: optionalString
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== 'production') {
      return;
    }

    if (!config.CORS_ORIGIN || config.CORS_ORIGIN.includes('localhost')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGIN é obrigatório em produção e não pode ser localhost.',
        path: ['CORS_ORIGIN']
      });
    }
  })
  .transform((config) => {
    const s3Bucket = config.S3_BUCKET ?? config.STORAGE_BUCKET;
    const s3Endpoint = config.S3_ENDPOINT ?? config.STORAGE_ENDPOINT;
    const s3AccessKey = config.S3_ACCESS_KEY ?? config.STORAGE_ACCESS_KEY;
    const s3SecretKey = config.S3_SECRET_KEY ?? config.STORAGE_SECRET_KEY;

    return {
      ...config,
      S3_BUCKET: s3Bucket,
      S3_ENDPOINT: s3Endpoint,
      S3_ACCESS_KEY: s3AccessKey,
      S3_SECRET_KEY: s3SecretKey,
      HOST:
        config.HOST ??
        (config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
    };
  });

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
