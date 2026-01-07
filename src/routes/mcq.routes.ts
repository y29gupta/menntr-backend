import { bulkUploadMcqHandler } from "../controllers/mcq.controller";
import { authGuard } from "../hooks/auth.guard";


export async function mcqRoutes(app: any) {
app.post(
  '/mcq/bulk-upload',
  { preHandler: [authGuard] },
  bulkUploadMcqHandler
);

}

