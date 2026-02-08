export interface ResolvedModule {
  code: string;
  name: string;
  icon?: string | null;
  category?: string | null;
  sort_order: number;
}

export interface AccessContext {
  permissions: string[];
  modules: ResolvedModule[];
  plan_code: string;
}
