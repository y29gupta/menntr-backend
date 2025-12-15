export class Serializer {
  static bigIntToString(value: any): string {
    return typeof value === 'bigint' ? value.toString() : String(value);
  }

  static user(user: any) {
    return {
      id: this.bigIntToString(user.id),
      email: user.email,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      institutionId: user.institution_id ? this.bigIntToString(user.institution_id) : null,
      status: user.status ?? null,
      createdAt: user.created_at ?? null,
      updatedAt: user.updated_at ?? null,
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

  static authResponse(status: boolean,user: any, mustChangePassword = false) {
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
}
