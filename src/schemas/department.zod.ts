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

  category_id: z
    .number()
    .int('Category ID must be an integer')
    .positive('Category ID must be positive')
    .nullable()
    .optional(),

  // hod_user_id removed - users can be assigned later via user_roles table
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

    category_id: z
      .number()
      .int('Category ID must be an integer')
      .positive('Category ID must be positive')
      .nullable()
      .optional(),

    // hod_user_id removed
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update department',
  });
