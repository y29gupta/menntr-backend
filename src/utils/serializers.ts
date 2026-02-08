export class Serializer {
  static bigIntToString(value: any): string {
    return typeof value === 'bigint' ? value.toString() : String(value);
  }

  static user(user: any) {
    return {
      id: this.bigIntToString(user.id),
      email: user.email,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      institution_id: user.institution_id ?? null,
      status: user.status ?? null,
      created_at: user.created_at?.toISOString?.() ?? user.created_at,
      updated_at: user.updated_at?.toISOString?.() ?? user.updated_at,
      last_login_at: user.last_login_at?.toISOString?.() ?? user.last_login_at,
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

  // static authResponse(status: boolean, user: any, mustChangePassword = false) {
  //   return {
  //     // token,
  //     status: status,
  //     must_change_password: mustChangePassword,
  //     user: {
  //       id: this.bigIntToString(user.id),
  //       email: user.email,
  //       institution_id: user.institution_id,
  //       roles: user.roles,
  //     },
  //   };
  // }

  static authResponse(status: boolean, user: any, mustChangePassword = false) {
    return {
      status,
      must_change_password: mustChangePassword,
      user: {
        id: this.bigIntToString(user.id),
        email: user.email,
        institution_id: user.institution_id ?? null,
        roles: user.roles,
        permissions: user.permissions,
        modules: user.modules,
      },
    };
  }

  // static serializeRoles(user: any) {
  //   if (!user?.user_roles) return [];

  //   return user.user_roles.map((ur: any) => ({
  //     id: ur.role.id,
  //     name: ur.role.name,
  //     institution_id: ur.role.institution_id ?? null,
  //     is_system_role: ur.role.is_system_role,
  //   }));
  // }

  static serializeRoles(user: any) {
    if (!user?.user_roles) return [];

    return user.user_roles.map((ur: any) => ({
      id: ur.role.id,
      name: ur.role.name,
      institution_id: ur.role.institution_id ?? null,
      is_system_role: ur.role.is_system_role,
      role_hierarchy_id: ur.role.role_hierarchy_id ?? null,
      hierarchy_level: ur.role.hierarchy?.level ?? null,
      hierarchy_name: ur.role.hierarchy?.name ?? null,
    }));
  }
}
