import "@fastify/multipart";

declare module "fastify" {
  interface FastifyRequest {
    parts: () => AsyncIterableIterator<any>;
  }
}
