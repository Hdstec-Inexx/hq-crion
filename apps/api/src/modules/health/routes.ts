import { healthResponseSchema, type HealthResponse } from '@hq-crion/contracts/health';
import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply): Promise<HealthResponse> => {
    reply.header('Cache-Control', 'no-store');
    return healthResponseSchema.parse({ status: 'ok' });
  });
};

export default healthRoutes;
