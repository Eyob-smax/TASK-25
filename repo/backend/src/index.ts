import { buildApp } from './app.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`GreenCycle API listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.fatal(err, 'Failed to start GreenCycle API');
    process.exit(1);
  }
}

main();
