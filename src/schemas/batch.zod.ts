import { z } from 'zod';

export const CreateBatchSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),

  categoryRoleId: z.number().optional(),
  departmentRoleId: z.number(),

  // multiple faculty selection (not persisted for now)
  facultyIds: z.array(z.number()).optional(),

  coordinatorId: z.number().optional(),
  // academicYear: z.number().optional(),
  // ✅ using DB columns
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),

  isActive: z.boolean().default(true),
  sections: z.array(z.string().min(1)).min(1),
});

export const UpdateBatchSchema = CreateBatchSchema.partial();
