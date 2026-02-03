import { FastifyInstance, FastifyRequest } from 'fastify';
import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob';

type SasRequestBody = {
  attemptId: number;
  fileType: 'video' | 'image';
};

export async function proctoringRoutes(app: FastifyInstance) {
  app.post('/proctoring/sas', async (req: FastifyRequest<{ Body: SasRequestBody }>) => {
    const { attemptId, fileType } = req.body;

    const ext = fileType === 'video' ? 'webm' : 'jpg';
    const blobName = `attempts/${attemptId}/${Date.now()}.${ext}`;

    const client = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    );

    const container = client.getContainerClient('proctoring');
    const blob = container.getBlockBlobClient(blobName);

    const permissions = new BlobSASPermissions();
    permissions.create = true;
    permissions.write = true;

    const sasUrl = await blob.generateSasUrl({
      permissions,
      expiresOn: new Date(Date.now() + 5 * 60 * 1000),
      contentType: fileType === 'video' ? 'video/webm' : 'image/jpeg',
    });

    return { sasUrl, blobPath: blobName };
  });
}
