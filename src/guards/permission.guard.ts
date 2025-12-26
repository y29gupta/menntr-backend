import { ForbiddenError } from "../utils/errors";

export function requirePermission(permissionCode: string) {
  return async (request:any, reply:any) => {
    if (!request.user.permissions.includes(permissionCode)) {
      throw new ForbiddenError('Permission denied');
    }
  };
}
