import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(1),
  assignedUserId: z.number().optional(),
  departmentIds: z.array(z.number()).optional(),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1),
  assignedUserId: z.number().optional(),
  departmentIds: z.array(z.number()).optional(),
});
