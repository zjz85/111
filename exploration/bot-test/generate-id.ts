const DEFAULT_ID_LENGTH = 8;
const MIN_ID_LENGTH = 4;
const MAX_ID_LENGTH = 128;
const PREFIX_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const BASE62_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const ALPHABET_LENGTH = BASE62_ALPHABET.length;

export type GenerateResult = {
  success: boolean;
  code: string;
  message: string;
  data?: string;
};

export function generateId(
  options?: { prefix?: string; length?: number },
): GenerateResult {
  const prefix = options?.prefix;
  const length = options?.length ?? DEFAULT_ID_LENGTH;

  if (length < MIN_ID_LENGTH || length > MAX_ID_LENGTH) {
    return {
      success: false,
      code: "INVALID_LENGTH",
      message: `ID 长度必须在 ${MIN_ID_LENGTH} 到 ${MAX_ID_LENGTH} 之间，收到: ${length}`,
    };
  }

  if (prefix !== undefined && prefix !== "") {
    if (!PREFIX_PATTERN.test(prefix)) {
      return {
        success: false,
        code: "INVALID_PREFIX",
        message: `前缀 "${prefix}" 无效。必须以小写字母开头，只能包含小写字母、数字和下划线，最多 32 个字符。`,
      };
    }
  }

  let result = "";
  while (result.length < length) {
    const uuid = crypto.randomUUID().replace(/-/g, "");
    for (let i = 0; i < uuid.length && result.length < length; i++) {
      const codePoint = uuid.charCodeAt(i);
      result += BASE62_ALPHABET[codePoint % ALPHABET_LENGTH];
    }
  }

  const finalId = prefix ? `${prefix}_${result}` : result;

  return {
    success: true,
    code: "OK",
    message: "ID 生成成功",
    data: finalId,
  };
}
