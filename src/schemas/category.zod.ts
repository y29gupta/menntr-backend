import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Category name must be at least 2 characters'),

  code: z
    .string()
    .trim()
    .min(2, 'Category code must be at least 2 characters'),

  headUserId: z
    .number()
    .int('Head user ID must be an integer')
    .positive('Head user ID must be positive'),

  departmentIds: z
    .array(
      z
        .number()
        .int('Department ID must be an integer')
        .positive('Department ID must be positive')
    )
    .optional()
    .default([]),
});

export const UpdateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Category name must be at least 2 characters')
      .optional(),

    code: z
      .string()
      .trim()
      .min(2, 'Category code must be at least 2 characters')
      .optional(),

    headUserId: z
      .number()
      .int('Head user ID must be an integer')
      .positive('Head user ID must be positive')
      .optional(),

    departmentIds: z
      .array(
        z
          .number()
          .int('Department ID must be an integer')
          .positive('Department ID must be positive')
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update category',
  });
