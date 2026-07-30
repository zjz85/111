const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const MIN_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

export type ParseResult = {
  success: boolean;
  code: string;
  message: string;
  data?: { page: number; pageSize: number; offset: number };
};

export function parsePagination(
  rawPage?: string | null,
  rawPageSize?: string | null,
): ParseResult {
  let pageSize = DEFAULT_PAGE_SIZE;

  if (rawPageSize !== undefined && rawPageSize !== null && rawPageSize !== "") {
    const parsed = Number(rawPageSize);
    if (!Number.isFinite(parsed)) {
      return {
        success: false,
        code: "INVALID_PAGE_SIZE",
        message: `pageSize 必须为有效数字，收到: "${rawPageSize}"`,
      };
    }
    if (parsed < MIN_PAGE_SIZE || parsed > MAX_PAGE_SIZE) {
      return {
        success: false,
        code: "PAGE_SIZE_OUT_OF_RANGE",
        message: `pageSize 必须在 ${MIN_PAGE_SIZE} 到 ${MAX_PAGE_SIZE} 之间，收到: ${parsed}`,
      };
    }
    pageSize = parsed;
  }

  let page = DEFAULT_PAGE;

  if (rawPage !== undefined && rawPage !== null && rawPage !== "") {
    const parsed = Number(rawPage);
    if (!Number.isFinite(parsed)) {
      return {
        success: false,
        code: "INVALID_PAGE",
        message: `page 必须为有效数字，收到: "${rawPage}"`,
      };
    }
    if (parsed < MIN_PAGE) {
      return {
        success: false,
        code: "PAGE_OUT_OF_RANGE",
        message: `page 不能小于 ${MIN_PAGE}，收到: ${parsed}`,
      };
    }
    page = parsed;
  }

  return {
    success: true,
    code: "OK",
    message: "分页参数校验成功",
    data: {
      page,
      pageSize,
      offset: (page - 1) * pageSize,
    },
  };
}
