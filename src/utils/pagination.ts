/* ----------------------------------
   Pagination Types
----------------------------------- */

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/* ----------------------------------
   Normalize pagination input
----------------------------------- */
export function getPagination(query: PaginationQuery) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/* ----------------------------------
   Build standardized paginated response
----------------------------------- */
export function buildPaginatedResponse<T>(
  items: T[],
  totalCount: number,
  page: number,
  limit: number
) {
  const pageCount = Math.ceil(totalCount / limit);

  return {
    meta: {
      isFirstPage: page === 1,
      isLastPage: page >= pageCount,
      currentPage: page,
      previousPage: page > 1 ? page - 1 : null,
      nextPage: page < pageCount ? page + 1 : null,
      pageCount,
      totalCount,
      pageSize: limit,
    },
    data: items,
  };
}
