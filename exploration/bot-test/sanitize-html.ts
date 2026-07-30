const TAG_PATTERN = /<[^>]*>/g;

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39|nbsp);/g;
const WHITESPACE_PATTERN = /\s{2,}/g;
const MAX_INPUT_LENGTH = 50_000;

export type SanitizeResult = {
  success: boolean;
  code: string;
  message: string;
  data?: string;
};

export function sanitizeHtml(input?: string | null): SanitizeResult {
  if (input === undefined || input === null) {
    return { success: true, code: "EMPTY_INPUT", message: "输入为空，返回空字符串", data: "" };
  }

  if (input.length === 0) {
    return { success: true, code: "EMPTY_INPUT", message: "输入为空，返回空字符串", data: "" };
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return {
      success: false,
      code: "INPUT_TOO_LONG",
      message: `输入长度 ${input.length} 超过允许上限 ${MAX_INPUT_LENGTH}`,
    };
  }

  const stripped = input.replace(TAG_PATTERN, "");
  const unescaped = stripped.replace(ENTITY_PATTERN, (match) => ENTITY_MAP[match] ?? match);
  const normalized = unescaped.replace(WHITESPACE_PATTERN, " ").trim();

  return {
    success: true,
    code: "OK",
    message: "净化成功",
    data: normalized,
  };
}
