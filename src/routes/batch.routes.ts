import {
  listBatchHandler,
  createBatchHandler,
  updateBatchHandler,
  deleteBatchHandler,
  batchMetaHandler,
} from '../controllers/batch.controller';
import { authGuard } from '../hooks/auth.guard';

export async function batchRoutes(app: any) {
  app.get('/organization/batches', { preHandler: [authGuard] }, listBatchHandler);
  app.post('/organization/batches', { preHandler: [authGuard] }, createBatchHandler);
  app.put('/organization/batches/:id', { preHandler: [authGuard] }, updateBatchHandler);
  app.delete('/organization/batches/:id', { preHandler: [authGuard] }, deleteBatchHandler);

  app.get('/organization/batches/meta', { preHandler: [authGuard] }, batchMetaHandler);
}
