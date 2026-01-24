import { PrismaClient, AssessmentStatus, AttemptStatus } from '@prisma/client';

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