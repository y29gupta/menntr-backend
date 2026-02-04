import { PrismaClient } from '@prisma/client';

/**
 * Assign batches to a faculty user
 * Note: This requires a batch_faculty junction table in the database
 * For now, we'll store in batches.metadata as a workaround
 */
export async function assignBatchesToFaculty(
  prisma: PrismaClient,
  facultyUserId: bigint,
  batchIds: number[],
  institutionId: number
) {
  if (!batchIds || batchIds.length === 0) {
    return;
  }

  // Validate all batches belong to the institution
  const validBatches = await prisma.batches.findMany({
    where: {
      id: { in: batchIds },
      institution_id: institutionId,
      is_active: true,
    },
    select: { id: true },
  });

  if (validBatches.length !== batchIds.length) {
    throw new Error('Some batch IDs are invalid or do not belong to this institution');
  }

  // Store in batches metadata for now
  // TODO: Create a proper batch_faculty junction table
  for (const batch of validBatches) {
    const batchRecord = await prisma.batches.findUnique({
      where: { id: batch.id },
      select: { metadata: true },
    });

    const metadata = (batchRecord?.metadata as any) || {};
    const facultyIds = metadata.faculty_ids || [];
    
    if (!facultyIds.includes(Number(facultyUserId))) {
      facultyIds.push(Number(facultyUserId));
    }

    await prisma.batches.update({
      where: { id: batch.id },
      data: {
        metadata: {
          ...metadata,
          faculty_ids: facultyIds,
        },
      },
    });
  }
}

/**
 * Get batches assigned to a faculty user
 */
export async function getBatchesForFaculty(
  prisma: PrismaClient,
  facultyUserId: bigint,
  institutionId: number
) {
  const batches = await prisma.batches.findMany({
    where: {
      institution_id: institutionId,
      is_active: true,
    },
    select: {
      id: true,
      name: true,
      academic_year: true,
      metadata: true,
    },
  });

  return batches
    .filter((batch) => {
      const metadata = (batch.metadata as any) || {};
      const facultyIds = metadata.faculty_ids || [];
      return facultyIds.includes(Number(facultyUserId));
    })
    .map((batch) => ({
      id: batch.id,
      name: batch.name,
      academic_year: batch.academic_year,
    }));
}
