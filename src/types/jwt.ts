export interface AuthJwtPayload {
  sub: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}
