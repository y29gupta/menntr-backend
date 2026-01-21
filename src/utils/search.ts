/* -----------------------------
   GLOBAL SEARCH BUILDER
------------------------------ */
export function buildGlobalSearch(search: string | undefined, fields: string[]) {
  if (!search) return undefined;

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: search,
        mode: 'insensitive',
      },
    })),
  };
}
