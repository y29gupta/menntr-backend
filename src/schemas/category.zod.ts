import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(2, 'Category name is required'),
  code: z.string().min(2, 'Category code is required'),
  headUserId: z.number().int('Invalid user id'),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).optional(),
  headUserId: z.number().int().optional(),
});