import z from "zod";

export const LoginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, { message: 'Email is required' })
      .max(254)
      .email()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format')
      .transform((v) => v.toLowerCase()),

    password: z.string().trim().min(1, { message: 'Password is required' }).max(128),

    institution_code: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const InviteSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    institution_id: z.number().int().positive(),
  })
  .strict();

export const ConsumeInviteSchema = z
  .object({
    token: z.string().min(32).max(256),
  })
  .strict();

export const ChangePasswordSchema = z
  .object({
    new_password: z
      .string()
      .trim()
      .min(12, { message: 'Password must be at least 12 characters' })
      .max(128, { message: 'Password is too long' })
      .regex(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
      .regex(/[a-z]/, { message: 'Password must contain a lowercase letter' })
      .regex(/[0-9]/, { message: 'Password must contain a number' })
      .regex(/[^A-Za-z0-9]/, {
        message: 'Password must contain a special character',
      }),
    confirm_new_password: z.string().trim(),
  })
  .strict()
  .refine((data) => data.new_password === data.confirm_new_password, {
    path: ['confirm_new_password'],
    message: 'Passwords do not match',
  });
