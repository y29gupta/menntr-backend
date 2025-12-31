import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(2, 'Category name is required'),
  code: z.string().min(2, 'Category code is required'),
  headUserId: z.number().int().positive(),
  departmentIds: z.array(z.number().int().positive()).default([]),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).optional(),
  headUserId: z.number().int().positive().optional(),
  departmentIds: z.array(z.number().int().positive()).optional(),
});
