export interface AuthJwtPayload {
  sub: string;
  email: string;
  roles: string[];
  institution_id: number;
  iat?: number;
  exp?: number;
  aud?: string;
  iss?: string;
}
