import { PrismaClient } from '@prisma/client';

export async function getAssessmentSettings(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findFirst({
    where: {
      id: assessmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
    include: {
      batches: {
        include: {
          batch: { select: { id: true, name: true, code: true } },
        },
      },
      students: {
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      },
    },
  });

  if (!assessment) {
    throw new Error('Assessment not found or forbidden');
  }

  const meta = (assessment.metadata ?? {}) as any;

  return {
    readOnly: {
      assessmentName: assessment.title,
      assessmentType: meta.type ?? 'practice',
      durationMinutes: assessment.duration_minutes,
      maxAttempts: assessment.max_attempts,
      publishedAt: assessment.published_at,
      expiresAt: assessment.end_time,
      candidateSelection: {
        batches: assessment.batches.map((b) => ({
          id: b.batch.id,
          name: b.batch.name,
          code: b.batch.code,
        })),
        students: assessment.students.map((s) => ({
          id: s.student.id,
          name: `${s.student.first_name} ${s.student.last_name}`,
          email: s.student.email,
        })),
      },
    },

    reattemptRules: meta.reattemptRules ?? {
      enabled: false,
      assignAbsent: false,
      belowScore: {
        enabled: false,
        threshold: null,
        previousAssessmentId: null,
      },
      aboveScore: {
        enabled: false,
        threshold: null,
        previousAssessmentId: null,
      },
    },

    testConfig: {
      reportVisibility: assessment.show_results_immediate,
      navigationMode: assessment.allow_backtrack,
      tabProctoring: assessment.tab_switch_limit !== null,
      cameraProctoring: assessment.require_webcam,
      fullScreenRecording: assessment.proctoring_enabled,
    },
  };
}

export async function updateAssessmentSettings(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number,
  payload: {
    reattemptRules?: {
      enabled?: boolean;
      assignAbsent?: boolean;
      scoreBelow?: number | null;
      scoreAbove?: number | null;
      previousAssessmentId?: bigint | null;
    };
    testConfig?: {
      reportVisibility?: boolean;
      navigationMode?: boolean;
      tabProctoring?: boolean;
      cameraProctoring?: boolean;
      fullScreenRecording?: boolean;
    };
  }
) {
  const assessment = await prisma.assessments.findFirst({
    where: { id: assessmentId, institution_id: institutionId },
    select: { id: true, metadata: true },
  });

  if (!assessment) {
    throw new Error('Assessment not found or forbidden');
  }

  const existingMeta = (assessment.metadata ?? {}) as any;

  const normalizedReattemptRules = payload.reattemptRules
    ? {
        enabled: payload.reattemptRules.enabled ?? false,
        assignAbsent: payload.reattemptRules.assignAbsent ?? false,
        belowScore: {
          enabled: payload.reattemptRules.scoreBelow != null,
          threshold: payload.reattemptRules.scoreBelow ?? null,
          previousAssessmentId: payload.reattemptRules.previousAssessmentId ?? null,
        },
        aboveScore: {
          enabled: payload.reattemptRules.scoreAbove != null,
          threshold: payload.reattemptRules.scoreAbove ?? null,
          previousAssessmentId: payload.reattemptRules.previousAssessmentId ?? null,
        },
      }
    : existingMeta.reattemptRules;

  await prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      show_results_immediate: payload.testConfig?.reportVisibility,
      allow_backtrack: payload.testConfig?.navigationMode,
      tab_switch_limit: payload.testConfig?.tabProctoring ? 3 : null,
      require_webcam: payload.testConfig?.cameraProctoring,
      proctoring_enabled: payload.testConfig?.fullScreenRecording,

      metadata: {
        ...existingMeta,
        reattemptRules: normalizedReattemptRules,
      },
    },
  });

  return { updated: true };
}
