// src/schemas/department.schema.ts
import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  name: z.string().min(2),
  categoryRoleId: z.number(), // parent role (Category Admin)
  hodUserId: z.string().optional(), // user id
});

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(2).optional(),
  categoryRoleId: z.number().optional(),
  hodUserId: z.string().optional(),
});
