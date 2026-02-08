import { FastifyInstance } from 'fastify';
import {
  listCategories,
  addCategory,
  editCategory,
  categoryMeta,
  getCategoryById,
  deleteCategory,
} from '../controllers/category.controller';
import { authGuard } from '../hooks/auth.guard';

export async function categoryRoutes(app: FastifyInstance) {
  app.get(
    '/organization/categories',
    { preHandler: [authGuard] },
    listCategories
  );

  app.get('/organization/categories/meta',
    {preHandler: [authGuard]},
    categoryMeta
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

  app.get(
  '/organization/categories/:id',
  { preHandler: [authGuard] },
  getCategoryById
);
app.delete(
  '/organization/categories/:id',
  { preHandler: [authGuard] },
  deleteCategory
);
}
