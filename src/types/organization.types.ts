// src/types/hierarchy.types.ts

export type AddCategoryBody = {
  name: string;
};

export type AddDepartmentBody = {
  name: string;
  categoryRoleId: number;
};

export type MoveNodeBody = {
  newParentId: number | null;
};

export type MoveNodeParams = {
  id: string;
};

export type DeleteNodeParams = {
  id: string;
};
