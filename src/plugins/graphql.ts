import mercurius from 'mercurius';
import { FastifyInstance } from 'fastify';
import { typeDefs } from '../graphql/schema';
import { resolvers } from '../graphql/resolvers';

export async function graphqlPlugin(app: FastifyInstance) {
  app.register(mercurius, {
    schema: typeDefs,
    resolvers,
    graphiql: true,
  });
}
