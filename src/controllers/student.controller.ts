import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/student.service';
import { triggerStudentInvite } from '../services/student-invite.helper';
import { EmailService } from '../services/email';
import { success } from 'zod';
/* -----------------------------
   TYPES
------------------------------ */
interface CreateStudentBody {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  gender?: 'male' | 'female' | 'other';
  roll_number?: string;
  batch_id: number;
  avatar_url?: string;
}
interface ListStudentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  batch_id?: number;
  department_role_id?: number;
  status?: 'active' | 'inactive' | 'suspended';
}

/* -----------------------------
   META
------------------------------ */

export async function studentMetaHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const meta = await service.getStudentMeta(req.prisma, user.institution_id);

  reply.send(meta);
}

/* -----------------------------
   LIST STUDENTS (Dashboard)
------------------------------ */

export async function listStudentsHandler(
  req: FastifyRequest<{ Querystring: ListStudentsQuery }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.listStudents(req.prisma, {
    institution_id: user.institution_id,
    ...req.query,
  });

  reply.send(result);
}

export async function createStudentHandler(
  req: FastifyRequest<{ Body: CreateStudentBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const student = await service.createStudent(req.prisma, {
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    ...req.body,
  });

  reply.send(student);
}

export async function academicMetaHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;
  const data = await service.getAcademicMeta(req.prisma, user.institution_id);
  reply.send(data);
}

export async function academicDepartmentsHandler(
  req: FastifyRequest<{ Querystring: { category_role_id?: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const categoryRoleId = Number(req.query.category_role_id);

  if (!categoryRoleId || Number.isNaN(categoryRoleId)) {
    return reply.status(400).send({
      error: 'category_role_id is required and must be a number',
    });
  }

  // 🔥 ENSURE NUMBER is passed
  const data = await service.getDepartments(
    req.prisma,
    user.institution_id,
    categoryRoleId // <- number, not string
  );

  reply.send(data);
}

export async function academicBatchesHandler(
  req: FastifyRequest<{ Querystring: { department_role_id: number } }>,
  reply: FastifyReply
) {
  const user = req.user as any;
  const department_role_id = Number(req.query.department_role_id);
  const data = await service.getBatches(req.prisma, user.institution_id, department_role_id);
  reply.send(data);
}

/* -----------------------------
   SAVE ACADEMIC DETAILS
------------------------------ */

export async function saveAcademicDetailsHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      batch_id: number;
      roll_number?: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.saveAcademicDetails(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    ...req.body,
  });

  reply.send(result);
}

export async function enrollmentMetaHandler(req: FastifyRequest, reply: FastifyReply) {
  reply.send({
    admission_types: [
      { key: 'regular', label: 'Regular' },
      { key: 'lateral', label: 'Lateral Entry' },
      { key: 'transfer', label: 'Transfer' },
      { key: 'management', label: 'Management Quota' },
    ],
    enrollment_statuses: [
      { key: 'active', label: 'Active' },
      { key: 'on_hold', label: 'On-Hold' },
      { key: 'alumni', label: 'Alumni' },
      { key: 'dropped', label: 'Dropped' },
    ],
  });
}

export async function saveEnrollmentHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      admission_type: 'regular' | 'lateral' | 'transfer' | 'management';
      enrollment_status: 'active' | 'on_hold' | 'alumni' | 'dropped';
      joining_date: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.saveEnrollmentDetails(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    ...req.body,
  });

  reply.send(result);
}

export async function getPlatformAccessHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getPlatformAccess(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
  });

  reply.send(data);
}

export async function savePlatformAccessHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      login_enabled: boolean;
      assessment_enabled: boolean;
      result_view_enabled: boolean;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.savePlatformAccess(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    ...req.body,
  });

  reply.send(result);
}

export async function getAdditionalInfoHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getAdditionalInfo(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
  });

  reply.send(data);
}

export async function saveAdditionalInfoHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      guardian_name?: string;
      guardian_contact?: string;
      notes?: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.saveAdditionalInfo(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    ...req.body,
  });

  if(result?.student?.email) {
    try {
      const emailService = new EmailService(req.server.mailer);

      await triggerStudentInvite(req.prisma, emailService, {
        userId: result.student.id,
        email: result.student.email,
        firstName: result.student.first_name,
        lastName: result.student.last_name,
        inviterName: 'Institution Admin',
      })
    } catch (err) {
      req.log.error(err, 'Student invite email failed');
    }
  }

  reply.send({
    success: true,
    message: 'Additional information saved & invite sent'
  });

  // reply.send(result);
}

export async function deleteStudentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.deleteStudent(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    deleted_by: BigInt(user.sub),
  });

  reply.send(result);
}

export async function getStudentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getStudent(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
  });

  reply.send(data);
}



export async function updateStudentHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
      gender?: string;
      avatar_url?: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.updateStudent(req.prisma, {
    student_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    ...req.body,
  });

  // ✅ SEND INVITE ONLY IF EMAIL CHANGED
  if (result.emailChanged) {
    try {
      const emailService = new EmailService(req.server.mailer);

      await triggerStudentInvite(req.prisma, emailService, {
        userId: result.updatedStudent.id,
        email: result.updatedStudent.email,
        firstName: result.updatedStudent.first_name,
        lastName: result.updatedStudent.last_name,
        inviterName: 'Institution Admin',
      });
    } catch (err) {
      req.log.error(err, 'Student invite email failed');
    }
  }

  reply.send({
    success: true,
    message: result.emailChanged ? 'Student updated & invite sent' : 'Student updated successfully',
  });
}
