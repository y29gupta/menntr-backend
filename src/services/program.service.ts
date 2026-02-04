import { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../utils/errors';

export async function getPrograms(
  prisma: PrismaClient,
  institution_id: number,
  category_role_id?: number
) {
  const where: any = {
    roles: {
      institution_id: institution_id,
    },
    active: true,
  };

  if (category_role_id) {
    where.category_role_id = category_role_id;
  }

  const programs = await prisma.role_programs.findMany({
    where,
    select: {
      id: true,
      program_code: true,
      program_name: true,
      category_role_id: true,
    },
    orderBy: { program_name: 'asc' },
  });

  return programs;
}

export async function createProgram(
  prisma: PrismaClient,
  institution_id: number,
  input: {
    category_role_id: number;
    program_code: string;
    program_name: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    // Verify category belongs to institution
    const category = await tx.roles.findFirst({
      where: {
        id: input.category_role_id,
        institution_id: institution_id,
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Check if category already has a program assigned
    const existingProgram = await tx.role_programs.findFirst({
      where: {
        category_role_id: input.category_role_id,
        active: true,
      },
    });

    if (existingProgram) {
      throw new ConflictError('This category already has a program assigned. Each category can have only one program.');
    }

    // Check for duplicate program code within the same category
    const existing = await tx.role_programs.findFirst({
      where: {
        category_role_id: input.category_role_id,
        program_code: input.program_code,
      },
    });

    if (existing) {
      throw new ConflictError('Program code already exists for this category');
    }

    // Create program
    const program = await tx.role_programs.create({
      data: {
        category_role_id: input.category_role_id,
        program_code: input.program_code,
        program_name: input.program_name,
        updated_at: new Date(),
      },
    });

    return program;
  });
}

export async function createPrograms(
  prisma: PrismaClient,
  institution_id: number,
  category_role_id: number,
  programs: Array<{ program_code: string; program_name: string }>
) {
  if (!programs || programs.length === 0) {
    return [];
  }

  return prisma.$transaction(async (tx) => {
    // Verify category belongs to institution
    const category = await tx.roles.findFirst({
      where: {
        id: category_role_id,
        institution_id: institution_id,
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Create all programs
    const createdPrograms = await Promise.all(
      programs.map(async (program) => {
        // Check for duplicate program code within the same category
        const existing = await tx.role_programs.findFirst({
          where: {
            category_role_id: category_role_id,
            program_code: program.program_code,
          },
        });

        if (existing) {
          // Skip if already exists
          return existing;
        }

        return tx.role_programs.create({
          data: {
            category_role_id: category_role_id,
            program_code: program.program_code,
            program_name: program.program_name,
            updated_at: new Date(),
          },
        });
      })
    );

    return createdPrograms;
  });
}
