import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Department name must be at least 2 characters'),

  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters'),

  categoryId: z
    .number()
    .int('Category ID must be an integer')
    .positive('Category ID must be positive')
    .nullable()
    .optional(),

  hodUserId: z
    .number()
    .int('HOD user ID must be an integer')
    .positive('HOD user ID must be positive')
    .optional(),
});

export const UpdateDepartmentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Department name must be at least 2 characters')
      .optional(),

    code: z
      .string()
      .trim()
      .min(2, 'Department code must be at least 2 characters')
      .optional(),

    categoryId: z
      .number()
      .int('Category ID must be an integer')
      .positive('Category ID must be positive')
      .nullable()
      .optional(),

    hodUserId: z
      .number()
      .int('HOD user ID must be an integer')
      .positive('HOD user ID must be positive')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update department',
  });
