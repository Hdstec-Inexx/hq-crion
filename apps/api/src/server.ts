import { buildApp } from './app.js';

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

try {
  app = await buildApp();
  await app.listen({ host: app.config.HOST, port: app.config.PORT });
} catch (error) {
  if (app) {
    app.log.error(error);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
