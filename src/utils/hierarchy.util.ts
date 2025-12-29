// src/utils/hierarchy.util.ts

import { Role } from '@prisma/client';

export type HierarchyNode = Role & {
  children: HierarchyNode[];
};

export function buildTree(roles: Role[]): HierarchyNode[] {
  const map = new Map<number, HierarchyNode>();

  const roots: HierarchyNode[] = [];

  for (const role of roles) {
    map.set(role.id, { ...role, children: [] });
  }

  for (const role of roles) {
    const node = map.get(role.id)!;

    if (role.parentId) {
      const parent = map.get(role.parentId);
      parent?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
