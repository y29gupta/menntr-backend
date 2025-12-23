export class Serializer {
  static bigIntToString(value: any): string {
    return typeof value === 'bigint' ? value.toString() : String(value);
  }

  static user(user: any) {
    return {
      id: this.bigIntToString(user.id),
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      institutionId: user.institutionId ?? null,
      status: user.status ?? null,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
      lastLoginAt: user.lastLoginAt?.toISOString?.() ?? user.lastLoginAt,
    };
  }

  static institution(inst: any) {
    return {
      id: this.bigIntToString(inst.id),
      name: inst.name,
      code: inst.code,
      subdomain: inst.subdomain,
      contactEmail: inst.contact_email,
      planId: inst.plan_id ? this.bigIntToString(inst.plan_id) : null,
      status: inst.status,
      createdAt: inst.created_at ?? null,
      updatedAt: inst.updated_at ?? null,
    };
  }

  static authResponse(status: boolean, user: any, mustChangePassword = false) {
    return {
      // token,
      status: status,
      mustChangePassword,
      user: {
        id: this.bigIntToString(user.id),
        email: user.email,
      },
    };
  }
  static serializeRoles(user: any) {
    if (!user?.roles) return [];

    return user.roles.map((ur: any) => ({
      id: ur.role.id,
      name: ur.role.name,
      institutionId: ur.role.institutionId ?? null,
      isSystemRole: ur.role.isSystemRole,
    }));
  }
}
