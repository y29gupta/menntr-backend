
import { roles } from '@prisma/client';

export type HierarchyNode = roles & {
  children: HierarchyNode[];
};

export function buildTree(roles: roles[]): HierarchyNode[] {
  const map = new Map<number, HierarchyNode>();

  const roots: HierarchyNode[] = [];

  for (const role of roles) {
    map.set(role.id, { ...role, children: [] });
  }

  for (const role of roles) {
    const node = map.get(role.id)!;

    if (role.parent_id) {
      const parent = map.get(role.parent_id);
      parent?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
