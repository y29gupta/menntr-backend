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

  programs: z
    .array(
      z.object({
        program_code: z.string().trim().min(1, 'Program code is required'),
        program_name: z.string().trim().min(1, 'Program name is required'),
      })
    )
    .max(1, 'Each category can have only one program')
    .optional()
    .default([]),

  // headUserId and departmentIds are no longer required
  // Users can be assigned later via user_roles table
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

    programs: z
      .array(
        z.object({
          program_code: z.string().trim().min(1, 'Program code is required'),
          program_name: z.string().trim().min(1, 'Program name is required'),
        })
      )
      .max(1, 'Each category can have only one program')
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
