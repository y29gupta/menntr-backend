import { FastifyInstance } from 'fastify';
import {
  listCategories,
  addCategory,
  editCategory,
} from '../controllers/category.controller';
import { authGuard } from '../hooks/auth.guard';

export async function categoryRoutes(app: FastifyInstance) {
  app.get(
    '/organization/categories',
    { preHandler: [authGuard] },
    listCategories
  );

  app.post(
    '/organization/categories',
    { preHandler: [authGuard] },
    addCategory
  );

  app.put(
    '/organization/categories/:id',
    { preHandler: [authGuard] },
    editCategory
  );
}
