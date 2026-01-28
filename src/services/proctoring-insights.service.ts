// services/proctoring-insights.service.ts
import { PrismaClient } from '@prisma/client';

export async function generateProctoringInsights(
  prisma: PrismaClient,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment: { institution_id: institutionId },
    },
    include: {
      proctoring_events: true,
    },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  const hasViolations =
    attempt.tab_switches > 0 ||
    (Array.isArray(attempt.violations) && attempt.violations.length > 0);

  // ✅ No cheating → nothing to generate
  if (!hasViolations) {
    return { status: 'NO_DATA' };
  }

  // ✅ Avoid duplicate generation
  if (attempt.proctoring_events.length > 0) {
    return { status: 'PROCESSING' };
  }

  // 🔥 Mock async evidence creation (queue later)
  await prisma.proctoring_events.createMany({
    data: [
      {
        attempt_id: attemptId,
        event_type: 'TAB_SWITCH',
        image_url: 'https://cdn.menntr.ai/screenshots/tab-switch-1.png',
      },
      {
        attempt_id: attemptId,
        event_type: 'CAMERA_OFF',
        image_url: 'https://cdn.menntr.ai/screenshots/camera-off-1.png',
      },
    ],
  });

  return { status: 'PROCESSING' };
}
