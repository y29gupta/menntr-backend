import { buildApp } from './app';
import { config } from './config';

const app = buildApp();

const start = async () => {
    try {
        await app.listen({ port: config.port, host: '0.0.0.0' });
        app.log.info(`Server listening at ${config.port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();