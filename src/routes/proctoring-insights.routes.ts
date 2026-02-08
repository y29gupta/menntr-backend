// routes/proctoring-insights.routes.ts
import { authGuard } from '../hooks/auth.guard';
import { generateProctoringInsightsHandler } from '../controllers/proctoring-insights.controller';
import { getReadSasUrl } from '../services/proctoring-insights.service';

export async function proctoringInsightsRoutes(app: any) {
  app.post(
    '/attempts/:attemptId/proctoring/generate',
    { preHandler: [authGuard] },
    generateProctoringInsightsHandler
  );
  app.get('/proctoring/evidence/:attemptId', async (req: any, reply:any) => {
    const attemptId = BigInt(req.params.attemptId);

    const events = await req.server.prisma.proctoring_events.findMany({
      where: { attempt_id: attemptId },
    });

    const enriched = await Promise.all(
      events.map(async (e:any) => ({
        ...e,
        videoSasUrl: e.video_url ? await getReadSasUrl(e.video_url) : null,
        imageSasUrl: e.image_url ? await getReadSasUrl(e.image_url) : null,
      }))
    );

    reply.send(enriched);
  });

}
