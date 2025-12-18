import { MercuriusContext } from 'mercurius';
import { serializeBigInt } from '../utils/bigint';

export const resolvers = {
  Query: {
    users: async (_: unknown, __: unknown, ctx: MercuriusContext) => {
      const req = ctx.reply.request;

      const users = await req.prisma.user.findMany({
        include: {
          institution: true,
          roles: { include: { role: true } },
        },
      });

      return serializeBigInt(users);
    },

    user: async (_: unknown, { id }: { id: string }, ctx: MercuriusContext) => {
      const req = ctx.reply.request;

      const user = await req.prisma.user.findUnique({
        where: { id: BigInt(id) },
        include: {
          institution: true,
          roles: { include: { role: true } },
        },
      });

      return serializeBigInt(user);
    },
  },

  Mutation: {
    createUser: async (_: unknown, args: any, ctx: MercuriusContext) => {
      const req = ctx.reply.request;

      const user = await req.prisma.user.create({
        data: args,
      });

      return serializeBigInt(user);
    },
  },
};
