#!/usr/bin/env bash
# danger-guard.sh — PreToolUse Hook
# 在 Bash/Write 工具执行前进行安全检查
# 退出码: 0=放行/警告, 2=拦截

set -uo pipefail

# ===== Helper: 从 JSON 中提取字段值 =====
get_json_field() {
  local json="$1"
  local field="$2"
  local val
  val=$(echo "$json" | grep -oP "\"$field\"\s*:\s*\"[^\"]*\"" | grep -oP ':"[^"]*"' | grep -oP '"[^"]*"$' | tr -d '"') || true
  echo "$val"
}

# ===== 读取所有 stdin =====
INPUT=$(cat)

# 无输入则放行
if [ -z "$INPUT" ]; then
  exit 0
fi

TOOL_NAME=$(get_json_field "$INPUT" "tool_name")
[ -z "$TOOL_NAME" ] && TOOL_NAME=$(get_json_field "$INPUT" "name")
COMMAND=$(get_json_field "$INPUT" "command")
DESCRIPTION=$(get_json_field "$INPUT" "description" || true)
FILE_PATH=$(get_json_field "$INPUT" "file_path")
CONTENT=$(get_json_field "$INPUT" "content")
FULL_TEXT="$COMMAND $DESCRIPTION"

# ===== 等级 2：绝对拦截（exit 2） =====
check_level2() {
  local text="$1"

  echo "$text" | grep -qP '\brm\s+-rf\s+/\s' && { echo "[danger-guard] 拦截：rm -rf / 会删除整个系统，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+/\*\s' && { echo "[danger-guard] 拦截：rm -rf /* 会删除所有文件，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+~(\s|$)' && { echo "[danger-guard] 拦截：删除用户主目录，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+/etc(\s|$)' && { echo "[danger-guard] 拦截：删除 /etc 系统配置目录，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+/boot(\s|$)' && { echo "[danger-guard] 拦截：删除 /boot 引导目录，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+/sys(\s|$)' && { echo "[danger-guard] 拦截：删除 /sys 系统目录，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\brm\s+-rf\s+/proc(\s|$)' && { echo "[danger-guard] 拦截：删除 /proc 系统目录，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\bdrop\s+database(\s|$)' && { echo "[danger-guard] 拦截：DROP DATABASE 会删除整个数据库，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\bformat\s+[c-zC-Z]:' && { echo "[danger-guard] 拦截：format 磁盘格式化命令，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\bdiskpart(\s|$)' && { echo "[danger-guard] 拦截：diskpart 磁盘分区工具操作，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP ':\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;' && { echo "[danger-guard] 拦截：Fork Bomb，已阻止" >&2; exit 2; }
  # sudo 危险操作
  echo "$text" | grep -qP '\bsudo\s+rm\s+-rf(\s|$)' && { echo "[danger-guard] 拦截：sudo rm -rf 提权删除，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\bsudo\s+chmod\s+777(\s|$)' && { echo "[danger-guard] 拦截：sudo chmod 777 权限全开放，已阻止" >&2; exit 2; }
  echo "$text" | grep -qP '\bsudo\s+chown\s+-R(\s|$)' && { echo "[danger-guard] 拦截：sudo chown -R 递归改所有者，已阻止" >&2; exit 2; }
}

# ===== 等级 1：警告但放行 =====
check_level1() {
  local text="$1"
  local warned=false

  echo "$text" | grep -qP '\brm\s+-rf\s+(?!/)' && { echo "[danger-guard] ⚠ 警告：rm -rf 不可逆，确认删除的是正确路径" >&2; warned=true; }
  echo "$text" | grep -qP '\bgit\s+reset\s+--hard\b' && { echo "[danger-guard] ⚠ 警告：git reset --hard 会丢失所有未提交更改" >&2; warned=true; }
  echo "$text" | grep -qP '\bgit\s+push\s+--force\b' && { echo "[danger-guard] ⚠ 警告：git push --force 会覆盖远程历史" >&2; warned=true; }
  echo "$text" | grep -qP '\bchmod\s+777\b' && { echo "[danger-guard] ⚠ 警告：chmod 777 开放全部权限，存在安全风险" >&2; warned=true; }
  echo "$text" | grep -qP '\bchown\s+-R\b' && { echo "[danger-guard] ⚠ 警告：chown -R 递归改所有者" >&2; warned=true; }
  echo "$text" | grep -qP '\bdocker\s+rm\s+-f\b' && { echo "[danger-guard] ⚠ 警告：强制删除 Docker 容器" >&2; warned=true; }
  echo "$text" | grep -qP '\bdocker\s+rmi\s+-f\b' && { echo "[danger-guard] ⚠ 警告：强制删除 Docker 镜像" >&2; warned=true; }
  echo "$text" | grep -qP '\bdocker\s+system\s+prune\b' && { echo "[danger-guard] ⚠ 警告：清理所有 Docker 未使用对象" >&2; warned=true; }
  echo "$text" | grep -qP '\bdocker\s+volume\s+prune\b' && { echo "[danger-guard] ⚠ 警告：清理所有未使用的 Docker 卷（数据丢失）" >&2; warned=true; }
  echo "$text" | grep -qP '\bcurl.*\|\s*(ba)?sh\b' && { echo "[danger-guard] ⚠ 警告：curl | sh 从网络安装脚本，请确认来源可信" >&2; warned=true; }
  echo "$text" | grep -qP '\bwget.*\|\s*(ba)?sh\b' && { echo "[danger-guard] ⚠ 警告：wget | sh 从网络安装脚本，请确认来源可信" >&2; warned=true; }
  echo "$text" | grep -qP '\bdel\s+/f\s+/s\b' && { echo "[danger-guard] ⚠ 警告：Windows del /f /s 强制递归删除" >&2; warned=true; }
  echo "$text" | grep -qP '\brmdir\s+/s\b' && { echo "[danger-guard] ⚠ 警告：Windows rmdir /s 递归删除目录" >&2; warned=true; }
  echo "$text" | grep -qP '\bformat\s+[A-Za-z]:' && { echo "[danger-guard] ⚠ 警告：格式化磁盘操作" >&2; warned=true; }
  echo "$text" | grep -qP '\bSet-ExecutionPolicy\b' && { echo "[danger-guard] ⚠ 警告：修改 PowerShell 执行策略，降低安全检查" >&2; warned=true; }
  echo "$text" | grep -qP '\bInvoke-Expression\b' && { echo "[danger-guard] ⚠ 警告：IEX 执行动态字符串，存在代码注入风险" >&2; warned=true; }

  # 始终返回 0 以避免 set -e 阻断
  return 0
}

# ===== Write 工具敏感路径检测 =====
check_write_path() {
  local path="$1"

  echo "$path" | grep -qP '\\system32\\' && { echo "[danger-guard] 拦截：不允许写入 Windows System32 目录" >&2; exit 2; }
  echo "$path" | grep -qP '/etc/' && { echo "[danger-guard] 拦截：不允许写入 /etc 系统配置目录" >&2; exit 2; }
  echo "$path" | grep -qP 'C:\\Windows' && { echo "[danger-guard] 拦截：不允许写入 Windows 系统目录" >&2; exit 2; }
  echo "$path" | grep -qP '/boot/' && { echo "[danger-guard] 拦截：不允许写入 /boot 引导目录" >&2; exit 2; }
  echo "$path" | grep -qP '\.env$' && { echo "[danger-guard] ⚠ 警告：修改 .env 环境变量文件，可能泄露密钥" >&2; return 0; }
  echo "$path" | grep -qP '/\.ssh/' && { echo "[danger-guard] ⚠ 警告：修改 SSH 配置" >&2; return 0; }
  echo "$path" | grep -qP 'id_rsa' && { echo "[danger-guard] ⚠ 警告：操作 SSH 私钥文件" >&2; return 0; }
  echo "$path" | grep -qP 'settings\.local\.json$' && { echo "[danger-guard] ⚠ 警告：修改 Claude Code 本地设置" >&2; return 0; }
  echo "$path" | grep -qP '\.mcp\.json$' && { echo "[danger-guard] ⚠ 警告：修改 MCP 服务器配置" >&2; return 0; }
  return 0
}

# ===== 主逻辑 =====
case "$TOOL_NAME" in
  Bash)
    check_level2 "$FULL_TEXT"
    check_level1 "$FULL_TEXT"
    ;;
  Write)
    check_level2 "$FILE_PATH $CONTENT"
    check_write_path "$FILE_PATH"
    check_level1 "$CONTENT"
    ;;
esac

exit 0
