import { FastifyReply, FastifyRequest } from "fastify";
import { ConflictError, ValidationError } from "../utils/errors";
import { Logger } from "../utils/logger";
import { provisionInstitution } from "./institution.service";
import { CreateInstitutionBody, serializeInstitution } from "../controllers/institution.controller";

export async function createInstitutionHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  try {
    const parsed = CreateInstitutionBody.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request', parsed.error.issues);

    const { name, code, subdomain, contactEmail, planId } = parsed.data;
    const prisma = request.prisma;
    const existing = await prisma.institution.findFirst({
      where: {
        OR: [{ code }, { subdomain: subdomain ?? undefined }],
      },
    });

    if (existing) {
      if (existing.code === code) {
        throw new ConflictError('Institution with this code already exists');
      }
      if (existing.subdomain === subdomain) {
        throw new ConflictError('Institution with this subdomain already exists');
      }
    }
    const inst = await prisma.institution.create({
      data: {
        name,
        code,
        subdomain,
        contactEmail,
        planId: planId ?? null,
        status: 'active',
      },
    });
    await provisionInstitution(prisma, inst.id, inst.planId);
    

    logger.audit({
      userId: (request as any).user?.sub,
      action: 'CREATE_INSTITUTION',
      resource: 'institutions',
      resourceId: inst.id.toString(),
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.code(201).send(serializeInstitution(inst));
  } catch (error: any) {
    logger.error('createInstitution failed', error as Error);
    throw error;
  }
}
