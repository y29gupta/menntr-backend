import {
  PrismaClient,
  AssessmentStatus,
  AttemptStatus,
  AssessmentRoundType,
  ProctoringEventType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildPaginatedResponse, getPagination } from '../../utils/pagination';

type StudentAssessmentStatus = 'ongoing' | 'upcoming' | 'completed' | 'published';

export async function listStudentAssessments(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    status: StudentAssessmentStatus;
  }
) {
  const now = new Date();

  // 1️⃣ Student → active batch
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      is_active: true,
      batch: {
        institution_id: input.institution_id,
        is_active: true,
      },
    },
  });

  if (!batchStudent) {
    return { assessments: [] };
  }

  // 2️⃣ Fetch all published assessments for batch
  const assessments = await prisma.assessments.findMany({
    where: {
      institution_id: input.institution_id,
      status: AssessmentStatus.published,
      is_deleted: false,
      batches: {
        some: { batch_id: batchStudent.batch_id },
      },
    },
    include: {
      attempts: {
        where: { student_id: input.student_id },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
    },
    orderBy: { start_time: 'asc' },
  });

  // 3️⃣ Student-visible filtering (FINAL)
  const filtered = assessments.filter((a) => {
    const attempt = a.attempts[0];

    const hasSubmitted =
      attempt?.status === AttemptStatus.submitted || attempt?.status === AttemptStatus.evaluated;

    const isStarted = !a.start_time || a.start_time <= now;
    const isExpired = !!a.end_time && a.end_time < now;
    const isUpcoming = !!a.start_time && a.start_time > now;

    switch (input.status) {
      case 'ongoing':
        return isStarted && !isExpired && !hasSubmitted;

      case 'upcoming':
        return isUpcoming && !hasSubmitted;

      case 'completed':
        return hasSubmitted || isExpired;

      case 'published':
        // 🔒 published = ongoing (student meaning)
        return isStarted && !isExpired && !hasSubmitted;

      default:
        return false;
    }
  });

  // 4️⃣ UI-ready response
  return {
    assessments: filtered.map((a) => {
      const attempt = a.attempts[0];
      const isStarted = !a.start_time || a.start_time <= now;

      return {
        id: a.id.toString(),
        title: a.title,

        type: a.tags?.includes('coding')
          ? 'Coding'
          : a.tags?.includes('mcq')
            ? 'MCQ'
            : 'Coding + MCQ',

        start_time: a.start_time,
        end_time: a.end_time,
        duration_minutes: a.duration_minutes,

        starts_in_ms:
          a.start_time && input.status === 'upcoming'
            ? Math.max(a.start_time.getTime() - now.getTime(), 0)
            : null,

        attempt_status: attempt?.status ?? 'not_started',

        can_start:
          isStarted &&
          (!attempt ||
            (attempt.status !== AttemptStatus.submitted &&
              attempt.status !== AttemptStatus.evaluated)),
      };
    }),
  };
}

// export async function getStudentAssessmentDetails(
//   prisma: PrismaClient,
//   input: {
//     student_id: bigint;
//     institution_id: number;
//     assessment_id: bigint;
//   }
// ) {
//   const now = new Date();

//   // 1️⃣ Verify student → batch
//   const batchStudent = await prisma.batch_students.findFirst({
//     where: {
//       student_id: input.student_id,
//       is_active: true,
//       batch: {
//         institution_id: input.institution_id,
//         is_active: true,
//       },
//     },
//   });

//   if (!batchStudent) {
//     throw new Error('Student not assigned to any active batch');
//   }

//   // 2️⃣ Fetch assessment
//   const assessment = await prisma.assessments.findFirst({
//     where: {
//       id: input.assessment_id,
//       institution_id: input.institution_id,
//       status: AssessmentStatus.published,
//       is_deleted: false,
//       batches: {
//         some: { batch_id: batchStudent.batch_id },
//       },
//     },
//     include: {
//       attempts: {
//         where: { student_id: input.student_id },
//         orderBy: { attempt_number: 'desc' },
//         take: 1,
//       },
//       questions: true,
//     },
//   });

//   if (!assessment) {
//     throw new Error('Assessment not accessible');
//   }

//   const attempt = assessment.attempts[0];

//   const hasSubmitted =
//     attempt?.status === AttemptStatus.submitted || attempt?.status === AttemptStatus.evaluated;

//   const isStarted = !assessment.start_time || assessment.start_time <= now;
//   const isExpired = !!assessment.end_time && assessment.end_time < now;

//   if (!isStarted || isExpired || hasSubmitted) {
//     throw new Error('Assessment not in ongoing state');
//   }

//   // 3️⃣ UI-ready response (matches your screen 🔥)
//   return {
//     id: assessment.id.toString(),
//     title: assessment.title,
//     description: assessment.description,

//     status: 'ongoing',

//     overview: {
//       duration_minutes: assessment.duration_minutes,
//       assessment_type:
//         assessment.tags?.includes('coding') && assessment.tags?.includes('mcq')
//           ? 'MCQ + Coding'
//           : assessment.tags?.includes('coding')
//             ? 'Coding'
//             : 'MCQ',

//       total_questions: assessment.questions.length,
//       total_marks: assessment.total_marks,
//       coding_questions: assessment.tags?.includes('coding') ? 'Yes' : 'No',
//       mcq_questions: assessment.tags?.includes('mcq') ? 'Yes' : 'No',
//     },

//     rules: [
//       'You can attempt this assessment only once.',
//       'The timer starts immediately after you begin.',
//       'Do not refresh or close the browser.',
//       'Responses are saved automatically.',
//       'Assessment will be auto-submitted when time ends.',
//     ],

//     evaluation: {
//       mcq: 'Evaluated automatically after submission.',
//       coding: 'Coding answers will be evaluated after test cases execution. Results may take time.',
//     },

//     attempt_status: attempt?.status ?? 'not_started',

//     can_start: true,
//   };
// }

// export async function getStudentAssessmentDetails(
//   prisma: PrismaClient,
//   input: {
//     student_id: bigint;
//     institution_id: number;
//     assessment_id: bigint;
//   }
// ) {
//   const now = new Date();

//   // 1️⃣ Validate student → active batch
//   const batchStudent = await prisma.batch_students.findFirst({
//     where: {
//       student_id: input.student_id,
//       is_active: true,
//       batch: {
//         institution_id: input.institution_id,
//         is_active: true,
//       },
//     },
//   });

//   if (!batchStudent) {
//     throw new Error('Student not assigned to any active batch');
//   }

//   // 2️⃣ Fetch assessment (published + batch scoped)
//   const assessment = await prisma.assessments.findFirst({
//     where: {
//       id: input.assessment_id,
//       institution_id: input.institution_id,
//       status: AssessmentStatus.published,
//       is_deleted: false,
//       batches: {
//         some: { batch_id: batchStudent.batch_id },
//       },
//     },
//     include: {
//       attempts: {
//         where: { student_id: input.student_id },
//         orderBy: { attempt_number: 'desc' },
//         take: 1,
//       },
//       questions: true,
//     },
//   });

//   if (!assessment) {
//     throw new Error('Assessment not accessible');
//   }

//   // 3️⃣ Student state evaluation
//   const attempt = assessment.attempts[0];

//   const hasSubmitted =
//     attempt?.status === AttemptStatus.submitted || attempt?.status === AttemptStatus.evaluated;

//   const isStarted = !assessment.start_time || assessment.start_time <= now;
//   const isExpired = !!assessment.end_time && assessment.end_time < now;
//   const isUpcoming = !!assessment.start_time && assessment.start_time > now;

//   if (hasSubmitted || isExpired) {
//     throw new Error('Assessment already completed');
//   }

//   // 4️⃣ Derive UI status
//   const uiStatus = isUpcoming ? 'upcoming' : 'ongoing';

//   // 5️⃣ FINAL UI RESPONSE (matches both screens 🔥)
//   return {
//     id: assessment.id.toString(),
//     title: assessment.title,
//     description: assessment.description,

//     status: uiStatus, // 🔥 ongoing | upcoming

//     overview: {
//       duration_minutes: assessment.duration_minutes,
//       assessment_type:
//         assessment.tags?.includes('coding') && assessment.tags?.includes('mcq')
//           ? 'MCQ + Coding'
//           : assessment.tags?.includes('coding')
//             ? 'Coding'
//             : 'MCQ',

//       total_questions: assessment.questions.length,
//       mcq_questions: assessment.tags?.includes('mcq') ? 'Yes' : 'No',
//       coding_questions: assessment.tags?.includes('coding') ? 'Yes' : 'No',
//       total_marks: assessment.total_marks,
//     },

//     rules: [
//       'You can attempt this assessment only once.',
//       'The timer starts immediately after you begin.',
//       'Do not refresh or close the browser during the assessment.',
//       'Your responses are saved automatically.',
//       'The assessment will be auto-submitted when time ends.',
//     ],

//     evaluation: {
//       mcq: 'MCQ answers will be evaluated automatically after submission.',
//       coding:
//         'Coding answers will be evaluated after test cases execution. Results may take some time.',
//     },

//     timing: {
//       start_time: assessment.start_time,
//       end_time: assessment.end_time,
//       starts_in_ms:
//         isUpcoming && assessment.start_time
//           ? Math.max(assessment.start_time.getTime() - now.getTime(), 0)
//           : null,
//     },

//     attempt_status: attempt?.status ?? 'not_started',

//     can_start: uiStatus === 'ongoing',
//     start_disabled_reason: uiStatus === 'upcoming' ? 'Assessment not started yet' : null,
//   };
// }

export async function getStudentAssessmentDetails(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const now = new Date();

  // 1️⃣ Validate student → active batch
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      is_active: true,
      batch: {
        institution_id: input.institution_id,
        is_active: true,
      },
    },
  });

  if (!batchStudent) {
    throw new Error('Student not assigned to any active batch');
  }

  // 2️⃣ Fetch assessment + latest attempt
  const assessment = await prisma.assessments.findFirst({
    where: {
      id: input.assessment_id,
      institution_id: input.institution_id,
      status: AssessmentStatus.published,
      is_deleted: false,
      batches: {
        some: { batch_id: batchStudent.batch_id },
      },
    },
    include: {
      attempts: {
        where: { student_id: input.student_id },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
      questions: {
        include: {
          question: true, // 🔥 THIS IS REQUIRED
        },
      },
    },
  });

  if (!assessment) {
    throw new Error('Assessment not accessible');
  }
  const totalQuestions = assessment.questions.length;

  const mcqCount = assessment.questions.filter((q) =>
    ['single_correct', 'multiple_correct', 'true_false'].includes(q.question.question_type)
  ).length;

  const codingCount = assessment.questions.filter(
    (q) => q.question.question_type === 'coding'
  ).length;

  const attempt = assessment.attempts[0];

  const isExpired = !!assessment.end_time && assessment.end_time < now;
  const isUpcoming = !!assessment.start_time && assessment.start_time > now;

  const hasAttempted = !!attempt;
  const hasSubmitted =
    attempt?.status === AttemptStatus.submitted ||
    attempt?.status === AttemptStatus.evaluated ||
    attempt?.status === AttemptStatus.expired;

  const isEvaluated = attempt?.status === AttemptStatus.evaluated;

  // 3️⃣ Derive UI STATUS
  let uiStatus: 'ongoing' | 'upcoming' | 'completed';

  if (hasSubmitted || isExpired) {
    uiStatus = 'completed';
  } else if (isUpcoming) {
    uiStatus = 'upcoming';
  } else {
    uiStatus = 'ongoing';
  }

  // 4️⃣ Base response (shared across all screens)
  const response: any = {
    id: assessment.id.toString(),
    title: assessment.title,
    description: assessment.description,

    status: uiStatus,

    overview: {
      duration_minutes: assessment.duration_minutes,

      assessment_type:
        mcqCount > 0 && codingCount > 0 ? 'MCQ + Coding' : codingCount > 0 ? 'Coding' : 'MCQ',

      total_questions: totalQuestions,
      mcq_questions: mcqCount,
      coding_questions: codingCount,
      total_marks: assessment.total_marks,
    },

    rules: [
      'You can attempt this assessment only once.',
      'The timer starts immediately after you begin.',
      'Do not refresh or close the browser during the assessment.',
      'Your responses are saved automatically.',
      'The assessment will be auto-submitted when time ends.',
    ],

    evaluation: {
      mcq: 'MCQ answers are evaluated automatically.',
      coding: 'Coding answers are evaluated after test cases execution. Results may take time.',
    },

    timing: {
      start_time: assessment.start_time,
      end_time: assessment.end_time,
    },

    attempt_status: attempt?.status ?? 'not_started',
  };

  // 5️⃣ Completed-specific actions (🔥 UI buttons)
  if (uiStatus === 'completed') {
    return {
      ...response,

      submission: hasAttempted
        ? {
            submitted_at: attempt?.submitted_at,
            time_taken_seconds: attempt?.time_taken_seconds,
            answered_questions: attempt?.answered_questions,
            skipped_questions: attempt?.skipped_questions,
          }
        : null,

      actions: {
        can_view_submission: hasAttempted,
        can_view_result: isEvaluated,
      },
    };
  }

  // 6️⃣ Upcoming / Ongoing behavior
  return {
    ...response,

    timing: {
      ...response.timing,
      starts_in_ms:
        uiStatus === 'upcoming' && assessment.start_time
          ? Math.max(assessment.start_time.getTime() - now.getTime(), 0)
          : null,
    },

    can_start: uiStatus === 'ongoing',
    start_disabled_reason: uiStatus === 'upcoming' ? 'Assessment not started yet' : null,
  };
}

export async function startAssessmentConsent(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const now = new Date();

  // 1️⃣ Validate student → active batch
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      is_active: true,
      batch: {
        institution_id: input.institution_id,
        is_active: true,
      },
    },
  });

  if (!batchStudent) {
    throw new Error('Student not assigned to any active batch');
  }

  // 2️⃣ Fetch assessment + latest attempt
  const assessment = await prisma.assessments.findFirst({
    where: {
      id: input.assessment_id,
      institution_id: input.institution_id,
      status: AssessmentStatus.published,
      is_deleted: false,
      batches: {
        some: { batch_id: batchStudent.batch_id },
      },
    },
    include: {
      attempts: {
        where: { student_id: input.student_id },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
    },
  });

  if (!assessment) {
    throw new Error('Assessment not accessible');
  }

  // 3️⃣ Check ONGOING only
  const isStarted = !assessment.start_time || assessment.start_time <= now;
  const isExpired = !!assessment.end_time && assessment.end_time < now;

  if (!isStarted || isExpired) {
    throw new Error('Consent allowed only for ongoing assessments');
  }

  const latestAttempt = assessment.attempts[0];

  if (
    latestAttempt &&
    (latestAttempt.status === AttemptStatus.submitted ||
      latestAttempt.status === AttemptStatus.evaluated ||
      latestAttempt.status === AttemptStatus.expired)
  ) {
    throw new Error('Assessment already completed');
  }

  // 4️⃣ Create or reuse ATTEMPT
  const attempt =
    latestAttempt ??
    (await prisma.assessment_attempts.create({
      data: {
        assessment_id: assessment.id,
        student_id: input.student_id,

        status: AttemptStatus.not_started,

        total_questions: 0,
        answered_questions: 0,
        correct_answers: 0,
        wrong_answers: 0,
        skipped_questions: 0,

        score_obtained: 0,
        total_score: assessment.total_marks ?? 0,
        percentage: 0,
      },
    }));

  // 5️⃣ Create SESSION (1 per attempt)
  const session = await prisma.assessment_sessions.create({
    data: {
      attempt_id: attempt.id,
      student_id: input.student_id,
      assessment_id: assessment.id,
      session_token: randomUUID(),
      current_round: AssessmentRoundType.mcq,
      is_active: true,
    },
  });

  // 6️⃣ UI RESPONSE (matches your screen 💜)
  return {
    assessment_id: assessment.id.toString(),
    attempt_id: attempt.id.toString(),
    session_token: session.session_token,

    step: {
      current: 1,
      total: 4,
      label: 'Before you begin',
    },

    consent: {
      camera_required: assessment.require_webcam || assessment.proctoring_enabled,
      microphone_required: assessment.proctoring_enabled,
      reason: ['Prevent malpractice', 'Ensure fair evaluation', 'Maintain test integrity'],
      data_retention_notice: 'Your data is not stored beyond the assessment.',
    },

    can_proceed: true,
  };
}

async function getActiveSession(prisma: PrismaClient, attemptId: bigint) {
  return prisma.assessment_sessions.findFirst({
    where: {
      attempt_id: attemptId,
      is_active: true,
    },
  });
}

export async function getMicCheck(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found. Consent required.');
  }

  return {
    step: {
      current: 2,
      total: 4,
      label: 'Microphone Check',
    },
    instructions: 'Please say "Hello" to test your microphone.',
    can_start_test: true,
  };
}

export async function startMicCheck(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  return {
    status: 'listening',
    message: 'Analyzing your voice',
  };
}

export async function submitMicCheckResult(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
    success: boolean;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  const metadata = (session.device_info as any) || {};

  metadata.mic_check = {
    status: input.success ? 'success' : 'failed',
    checked_at: new Date().toISOString(),
  };

  await prisma.assessment_sessions.update({
    where: { id: session.id },
    data: {
      device_info: metadata,
    },
  });

  if (!input.success) {
    return {
      success: false,
      message: 'We could not hear you. Please check microphone settings.',
      retry_allowed: true,
    };
  }

  return {
    success: true,
    message: 'Microphone detected — you sound good!',
    next_step: {
      current: 3,
      label: 'Camera Check',
    },
  };
}

export async function getCameraCheck(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found. Complete previous steps.');
  }

  return {
    step: {
      current: 3,
      total: 4,
      label: 'Camera Check',
    },
    instructions: 'Turn on your camera and align your face.',
    can_start_camera: true,
  };
}

/* -----------------------------
   START CAMERA CHECK
------------------------------ */
export async function startCameraCheck(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  return {
    status: 'camera_on',
    message: 'Camera is active. Please align your face.',
  };
}

/* -----------------------------
   SUBMIT CAMERA CHECK RESULT
------------------------------ */
export async function submitCameraCheckResult(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
    success: boolean;
  }
) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  const deviceInfo = (session.device_info as any) || {};

  deviceInfo.camera_check = {
    status: input.success ? 'success' : 'failed',
    checked_at: new Date().toISOString(),
  };

  await prisma.assessment_sessions.update({
    where: { id: session.id },
    data: {
      device_info: deviceInfo,
    },
  });

  // ❌ Log proctoring event on failure
  if (!input.success) {
    await prisma.proctoring_events.create({
      data: {
        attempt_id: session.attempt_id,
        event_type: ProctoringEventType.CAMERA_OFF,
      },
    });

    return {
      success: false,
      message: 'Camera not detected — please enable access.',
      retry_allowed: true,
    };
  }

  // ✅ Success → Step 4
  return {
    success: true,
    message: 'Camera working — you’re good to go.',
    next_step: {
      current: 4,
      label: 'Final Setup',
    },
  };
}

export async function startAssessment(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assessment_id: bigint;
  }
) {
  const now = new Date();

  // 1️⃣ Active session is REQUIRED
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
    include: {
      attempt: true,
      assessment: true,
    },
  });

  if (!session) {
    throw new Error('Session not found. Complete setup steps first.');
  }

  const { attempt, assessment } = session;

  // 2️⃣ Time validation
  const isStarted = !assessment.start_time || assessment.start_time <= now;
  const isExpired = !!assessment.end_time && assessment.end_time < now;

  if (!isStarted || isExpired) {
    throw new Error('Assessment is not available to start');
  }

  // 3️⃣ Ensure camera + mic checks are done
  const deviceInfo = (session.device_info as any) || {};

  if (assessment.proctoring_enabled) {
    if (deviceInfo.mic_check?.status !== 'success') {
      throw new Error('Microphone check not completed');
    }

    if (
      (assessment.require_webcam || assessment.proctoring_enabled) &&
      deviceInfo.camera_check?.status !== 'success'
    ) {
      throw new Error('Camera check not completed');
    }
  }

  // 4️⃣ Move ATTEMPT → IN_PROGRESS (idempotent)
  if (attempt.status === AttemptStatus.not_started) {
    await prisma.assessment_attempts.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.in_progress,
        started_at: now,
      },
    });
  }

  // 5️⃣ Lock session heartbeat
  await prisma.assessment_sessions.update({
    where: { id: session.id },
    data: {
      last_activity_at: now,
      heart_beat_at: now,
    },
  });

  // 6️⃣ FINAL UI RESPONSE (THIS MATCHES YOUR SCREEN)
  return {
    success: true,
    message: 'Assessment started successfully',
    assessment_id: assessment.id.toString(),
    attempt_id: attempt.id.toString(),
    session_token: session.session_token,

    ui: {
      button_label: 'Start', // 🔥 matches your UI
      next_screen: 'assessment',
    },
  };
}

export async function getStudentAssessmentOverview(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number
) {
  const attempts = await prisma.assessment_attempts.findMany({
    where: {
      student_id: studentId,
      assessment: { institution_id: institutionId },
      status: { in: ['submitted', 'evaluated'] },
    },
    select: {
      percentage: true,
      assessment: { select: { title: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  if (attempts.length === 0) {
    return {
      attemptRate: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      chart: [],
    };
  }

  const scores = attempts.map((a) => Number(a.percentage ?? 0));

  return {
    attemptRate: 100,
    averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    chart: attempts.map((a) => ({
      assessment: a.assessment.title,
      score: Math.round(Number(a.percentage ?? 0)),
    })),
  };
}

export async function getStudentAssessments(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number,
  query: { page?: number; limit?: number }
) {
  const { skip, limit, page } = getPagination(query);

  // 🔥 Latest attempt per assessment
  const attempts = await prisma.assessment_attempts.findMany({
    where: {
      student_id: studentId,
      assessment: { institution_id: institutionId },
      status: { in: ['submitted', 'evaluated'] },
    },
    include: {
      assessment: {
        select: {
          title: true,
          duration_minutes: true,
        },
      },
    },
    orderBy: [
      { assessment_id: 'asc' },
      { attempt_number: 'desc' }, // latest attempt first
    ],
  });

  const latestByAssessment = new Map<string, any>();

  for (const a of attempts) {
    const key = a.assessment_id.toString();
    if (!latestByAssessment.has(key)) {
      latestByAssessment.set(key, a);
    }
  }

  const rows = Array.from(latestByAssessment.values());

  return buildPaginatedResponse(
    rows.map((a) => ({
      assessmentId: a.assessment_id.toString(),
      assessmentName: a.assessment.title,
      attempt: a.attempt_number,
      durationMinutes: Math.round((a.time_taken_seconds ?? 0) / 60),
      score: `${a.score_obtained}/${a.total_score}`,
      percentage: Math.round(Number(a.percentage ?? 0)),
      status: a.status,
      attemptId: a.id.toString(), // 🔥 used for drill-down
    })),
    rows.length,
    page,
    limit
  );
}

export async function submitAssessmentFeedback(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    assessment_id: bigint;
    overall_rating: number;
    flow_rating: string;
    comments?: string;
  }
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      status: AttemptStatus.evaluated,
    },
  });

  if (!attempt) throw new Error('Feedback allowed only after submission');

  await prisma.assessment_feedback.create({
    data: {
      assessment_id: input.assessment_id,
      attempt_id: attempt.id,
      student_id: input.student_id,
      overall_rating: input.overall_rating,
      flow_rating: input.flow_rating,
      comments: input.comments,
    },
  });

  return {
    success: true,
    message: 'Thank you for your feedback 💜',
  };
}
