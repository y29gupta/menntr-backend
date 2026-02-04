
export type AddCategoryBody = {
  name: string;
};

export type AddDepartmentBody = {
  name: string;
  categoryRoleId: number;
};

export type MoveNodeBody = {
  newParentId?: number | null;
  newOrder?: number; // For reordering at same level
};

export type MoveNodeParams = {
  id: string;
};

export type DeleteNodeParams = {
  id: string;
};
