/**
 * 手机号格式化工具
 */
export type FormatResult = {
  success: boolean;
  code: string;
  message: string;
  data?: string;
};

/**
 * 将手机号格式化为 E.164 标准格式（+86 开头）
 * 输入必须为 11 位中国大陆手机号
 */
export function formatPhoneNumber(input: string): FormatResult {
  if (!input || input.trim() === "") {
    return { success: false, code: "INVALID_INPUT", message: "手机号不能为空" };
  }

  const phonePattern = /^1[3-9]\d{9}$/;
  const trimmed = input.trim();

  if (!phonePattern.test(trimmed)) {
    return { success: false, code: "INVALID_FORMAT", message: "手机号格式不正确" };
  }

  return {
    success: true,
    code: "OK",
    message: "格式化成功",
    data: `+86${trimmed}`,
  };
}
