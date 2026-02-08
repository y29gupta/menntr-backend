import { FastifyInstance } from 'fastify';
import { listPrograms, addProgram } from '../controllers/program.controller';
import { authGuard } from '../hooks/auth.guard';

export async function programRoutes(app: FastifyInstance) {
  app.get(
    '/organization/programs',
    { preHandler: [authGuard] },
    listPrograms
  );

  app.post(
    '/organization/programs',
    { preHandler: [authGuard] },
    addProgram
  );
}
