import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name is required'),
  code: z.string().min(2, 'Department code is required'),
  categoryId: z.number().int().positive().nullable().optional(), // optional category
  hodUserId: z.number().int().positive().optional(),
});

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  hodUserId: z.number().int().positive().optional(),
});
