export interface AuthJwtPayload {
  sub: string;
  email: string;
  roles: string[];
  institutionId: number;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}
