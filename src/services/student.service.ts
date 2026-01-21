import { PrismaClient } from '@prisma/client';
import { timeAgo } from '../utils/time';
import { ConflictError } from '../utils/errors';
import { getPagination, buildPaginatedResponse } from '../utils/pagination';
import { buildGlobalSearch } from '../utils/search';
/* -----------------------------
   META (Filters)
------------------------------ */

export async function getStudentMeta(prisma: PrismaClient, institutionId: number) {
  const batches = await prisma.batches.findMany({
    where: { institution_id: institutionId, is_active: true },
    include: {
      category_role: true,
      department_role: true,
    },
    orderBy: { name: 'asc' },
  });

  return {
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      academicYear: b.academic_year,
      category: b.category_role?.name,
      department: b.department_role.name,
    })),
  };
}

/* -----------------------------
   LIST STUDENTS
------------------------------ */

export async function listStudents(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    page?: number;
    limit?: number;
    search?: string;
    batch_id?: number;
    department_role_id?: number;
    status?: string;
  }
) {
  const { page, limit, skip } = getPagination(params);

  const where: any = {
    institution_id: params.institution_id,
    status: params.status ?? 'active',
    user_roles: {
      some: { role: { name: 'Student' } },
    },
  };
  if (params.batch_id) {
    where.batchStudents = {
      some: { batch_id: params.batch_id },
    };
  }
if (params.department_role_id) {
  where.batchStudents = {
    some: {
      batch: {
        department_role_id: params.department_role_id,
      },
    },
  };
}

if (params.search) {
  where.OR = [
    { first_name: { contains: params.search, mode: 'insensitive' } },
    { last_name: { contains: params.search, mode: 'insensitive' } },
    { email: { contains: params.search, mode: 'insensitive' } },
    {
      batchStudents: {
        some: {
          roll_number: { contains: params.search, mode: 'insensitive' },
        },
      },
    },
  ];
}


  const [students, total] = await Promise.all([
    prisma.users.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        batchStudents: {
          where: {
            ...(params.batch_id && { batch_id: params.batch_id }),
          },
          include: {
            batch: {
              include: {
                category_role: true,
                department_role: true,
                sections: {
                  orderBy: { sort_order: 'asc' },
                },
              },
            },
          },
        },
        assessment_attempts: {
          select: { percentage: true },
        },
      },
    }),
    prisma.users.count({ where }), //
  ]);

  const rows = students.map((s) => {
    const batch = s.batchStudents[0];
    const attempts = s.assessment_attempts;

    const avgScore =
      attempts.length > 0
        ? Math.round(
            attempts.reduce((sum, a) => sum + Number(a.percentage || 0), 0) / attempts.length
          )
        : null;

    return {
      id: s.id.toString(),
      studentName: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
      email: s.email,
      rollNumber: batch?.roll_number ?? '-',
      category: batch?.batch.category_role?.name ?? '-',
      department: batch?.batch.department_role?.name ?? '-',
      batch: batch ? `${batch.batch.academic_year}` : '-',
      section: batch?.section_id
        ? (batch.batch.sections.find((s) => s.id === batch.section_id)?.name ?? '-')
        : '-',
      assessmentsTaken: attempts.length,
      averageScore: avgScore,
      status: s.status,
      lastLogin: s.last_login_at ? timeAgo(s.last_login_at) : '-',
    };
  });

  return buildPaginatedResponse(rows, total, page, limit);
}

/* -----------------------------
   CREATE STUDENT
------------------------------ */

export async function createStudent(
  prisma: PrismaClient,
  input: {
    institution_id: number;
    created_by: bigint;

    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    gender?: string;
    roll_number?: string;
    batch_id: number;
    avatar_url?: string;
  }
) {
  // 1️⃣ Check duplicate email
  const existing = await prisma.users.findFirst({
    where: {
      email: input.email,
      institution_id: input.institution_id,
    },
  });

  if (existing) {
    throw new ConflictError('Student with this email already exists');
  }

  // 2️⃣ Get STUDENT role
  const studentRole = await prisma.roles.findFirst({
    where: {
      institution_id: input.institution_id,
      name: 'Student',
    },
  });

  if (!studentRole) {
    throw new Error('Student role not configured');
  }

  // 3️⃣ Create user + role + batch mapping (TRANSACTION)
  const student = await prisma.$transaction(async (tx) => {
    // USER
    const user = await tx.users.create({
      data: {
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        avatar_url: input.avatar_url,
        institution_id: input.institution_id,
        status: 'active',
        must_change_password: true,

        phone: input.phone,
        gender: input.gender,
      },
    });

    // ROLE
    await tx.user_roles.create({
      data: {
        user_id: user.id,
        role_id: studentRole.id,
        assigned_by: input.created_by,
      },
    });

    // BATCH
    // await tx.batch_students.create({
    //   data: {
    //     student_id: user.id,
    //     batch_id: input.batch_id,
    //     roll_number: input.roll_number,
    //   },
    // });

    return user;
  });

  return {
    success: true,
    student_id: student.id.toString(),
    message: 'Student added successfully',
  };
}

export async function getAcademicMeta(prisma: PrismaClient, institutionId: number) {
  const programs = await prisma.roles.findMany({
    where: {
      institution_id: institutionId,
      category_batches: { some: {} },
    },
    orderBy: { name: 'asc' },
  });

  return {
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
    })),
  };
}

export async function getDepartments(
  prisma: PrismaClient,
  institutionId: number,
  categoryRoleId: number
) {
  return {
    departments: (
      await prisma.roles.findMany({
        where: {
          institution_id: institutionId,
          department_batches: {
            some: {
              category_role_id: {
                equals: categoryRoleId, // ✅ explicit int filter
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      })
    ).map((d) => ({
      id: d.id,
      name: d.name,
    })),
  };
}

export async function getBatches(
  prisma: PrismaClient,
  institutionId: number,
  departmentRoleId: number
) {
  const batches = await prisma.batches.findMany({
    where: {
      institution_id: institutionId,
      department_role_id: departmentRoleId,
      is_active: true,
    },
    include: {
      sections: {
        orderBy: { sort_order: 'asc' },
      },
    },
    orderBy: [{ academic_year: 'desc' }, { name: 'asc' }],
  });

  return {
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      academic_year: b.academic_year,

      // ✅ NEW: sections array
      sections: b.sections.map((s) => ({
        id: s.id,
        name: s.name,
      })),
    })),
  };
}

/* -----------------------------
   SAVE ACADEMIC DETAILS
------------------------------ */

export async function saveAcademicDetails(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    batch_id: number;
    section_id?: number;
    roll_number?: string;
  }
) {
  const existing = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (existing) {
    throw new ConflictError('Academic details already added for this student');
  }
  // 2️⃣ Validate section belongs to batch (VERY IMPORTANT)
  if (input.section_id) {
    const section = await prisma.batch_sections.findFirst({
      where: {
        id: input.section_id,
        batch_id: input.batch_id,
      },
    });

    if (!section) {
      throw new ConflictError('Invalid section for selected batch');
    }
  }
  await prisma.batch_students.create({
    data: {
      student_id: input.student_id,
      batch_id: input.batch_id,
      section_id: input.section_id ?? null,
      roll_number: input.roll_number,
    },
  });

  return {
    success: true,
    message: 'Academic details saved successfully',
  };
}

export async function saveEnrollmentDetails(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    admission_type: string;
    enrollment_status: string;
    joining_date: string;
  }
) {
  // Student must already have academic mapping
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (!batchStudent) {
    throw new ConflictError('Academic details must be added before enrollment');
  }

  await prisma.batch_students.update({
    where: {
      batch_id_student_id: {
        batch_id: batchStudent.batch_id,
        student_id: input.student_id,
      },
    },
    data: {
      enrollment_date: new Date(input.joining_date),
      is_active: input.enrollment_status === 'active',
      metadata: {
        admission_type: input.admission_type,
        enrollment_status: input.enrollment_status,
        joining_date: input.joining_date,
      },
    },
  });

  return {
    success: true,
    message: 'Enrollment & status updated successfully',
  };
}

export async function getPlatformAccess(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
  }
) {
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (!batchStudent) {
    throw new ConflictError('Academic details not found for this student');
  }

  const meta = (batchStudent.metadata as any) || {};

  return {
    login_enabled: meta.platform_access?.login_enabled ?? true,
    assessment_enabled: meta.platform_access?.assessment_enabled ?? true,
    result_view_enabled: meta.platform_access?.result_view_enabled ?? true,
  };
}

export async function savePlatformAccess(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    login_enabled: boolean;
    assessment_enabled: boolean;
    result_view_enabled: boolean;
  }
) {
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (!batchStudent) {
    throw new ConflictError('Academic details must be added before platform access');
  }

  const existingMeta = (batchStudent.metadata as any) || {};

  await prisma.batch_students.update({
    where: {
      batch_id_student_id: {
        batch_id: batchStudent.batch_id,
        student_id: input.student_id,
      },
    },
    data: {
      metadata: {
        ...existingMeta,
        platform_access: {
          login_enabled: input.login_enabled,
          assessment_enabled: input.assessment_enabled,
          result_view_enabled: input.result_view_enabled,
        },
      },
    },
  });

  return {
    success: true,
    message: 'Platform access updated successfully',
  };
}

export async function getAdditionalInfo(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
  }
) {
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (!batchStudent) {
    throw new ConflictError('Student academic details not found');
  }

  const meta = (batchStudent.metadata as any) || {};

  return {
    guardian_name: meta.additional_info?.guardian_name ?? '',
    guardian_contact: meta.additional_info?.guardian_contact ?? '',
    notes: meta.additional_info?.notes ?? '',
  };
}

export async function saveAdditionalInfo(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    guardian_name?: string;
    guardian_contact?: string;
    notes?: string;
  }
) {
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      batch: { institution_id: input.institution_id },
    },
  });

  if (!batchStudent) {
    throw new ConflictError('Academic details must be completed first');
  }

  const existingMeta = (batchStudent.metadata as any) || {};

  await prisma.batch_students.update({
    where: {
      batch_id_student_id: {
        batch_id: batchStudent.batch_id,
        student_id: input.student_id,
      },
    },
    data: {
      metadata: {
        ...existingMeta,
        additional_info: {
          guardian_name: input.guardian_name,
          guardian_contact: input.guardian_contact,
          notes: input.notes,
        },
      },
    },
  });

  return {
    success: true,
    message: 'Additional information saved successfully',
  };
}

export async function deleteStudent(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    deleted_by: bigint;
  }
) {
  const student = await prisma.users.findFirst({
    where: {
      id: input.student_id,
      institution_id: input.institution_id,
      status: { not: 'deleted' },
    },
  });

  if (!student) {
    throw new ConflictError('Student not found or already deleted');
  }

  await prisma.$transaction(async (tx) => {
    // 1️⃣ Soft delete user
    await tx.users.update({
      where: { id: input.student_id },
      data: {
        status: 'deleted',
        updated_at: new Date(),
      },
    });

    // 2️⃣ Deactivate batch mappings
    await tx.batch_students.updateMany({
      where: {
        student_id: input.student_id,
      },
      data: {
        is_active: false,
      },
    });

    // 3️⃣ Revoke auth tokens (force logout)
    await tx.auth_tokens.deleteMany({
      where: {
        user_id: input.student_id,
        used_at: null,
      },
    });
  });

  return {
    success: true,
    message: 'Student deleted successfully',
  };
}

export async function getStudent(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
  }
) {
  const student = await prisma.users.findFirst({
    where: {
      id: input.student_id,
      institution_id: input.institution_id,
      status: { not: 'deleted' },
    },
    include: {
      batchStudents: {
        where: { is_active: true },
        include: {
          batch: {
            include: {
              category_role: true,
              department_role: true,
              sections: true,
            },
          },
        },
      },
    },
  });

  if (!student) {
    throw new ConflictError('Student not found');
  }

  const batch = student.batchStudents[0];
  const meta = (batch?.metadata as any) || {};

  return {
    // Step 1 – Basic Info
    basic_info: {
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      phone: student.phone,
      gender: student.gender,
      avatar_url: student.avatar_url,
    },

    // Step 2 – Academic
    academic: batch
      ? {
          category_role_id: batch.batch.category_role_id,
          department_role_id: batch.batch.department_role_id,
          batch_id: batch.batch_id,
          section_id: batch.section_id,
          section_name: batch.section_id
            ? batch.batch.sections.find((s) => s.id === batch.section_id)?.name
            : null,
          roll_number: batch.roll_number,
        }
      : null,

    // Step 3 – Enrollment
    enrollment: {
      admission_type: meta.admission_type ?? null,
      enrollment_status: meta.enrollment_status ?? null,
      joining_date: meta.joining_date ?? null,
    },

    // Step 4 – Platform Access
    platform_access: meta.platform_access ?? {
      login_enabled: true,
      assessment_enabled: true,
      result_view_enabled: true,
    },

    // Step 5 – Additional Info
    additional_info: meta.additional_info ?? {},
  };
}

export async function updateStudent(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    gender?: string;
    avatar_url?: string;
  }
) {
  const student = await prisma.users.findFirst({
    where: {
      id: input.student_id,
      institution_id: input.institution_id,
      status: { not: 'deleted' },
    },
  });

  if (!student) {
    throw new ConflictError('Student not found');
  }

  // Email uniqueness check
  if (input.email && input.email !== student.email) {
    const exists = await prisma.users.findFirst({
      where: {
        email: input.email,
        institution_id: input.institution_id,
        id: { not: input.student_id },
      },
    });

    if (exists) {
      throw new ConflictError('Email already in use');
    }
  }

  await prisma.users.update({
    where: { id: input.student_id },
    data: {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      gender: input.gender,
      avatar_url: input.avatar_url,
    },
  });

  return {
    success: true,
    message: 'Student basic information updated successfully',
  };
}
