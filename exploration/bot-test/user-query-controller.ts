import { PrismaClient } from "@prisma/client";

/**
 * 用户 Controller — 查询用户（测试样例，与 sample-pr-002 对应）
 *
 * 预期打回（ARCH-001 违规）：Controller 绕过 userService 直接实例化
 * PrismaClient 并直连数据库查询，破坏分层架构。
 */
export class UserQueryController {
  private db: PrismaClient;

  constructor() {
    // ❌ ARCH-001 违规：Controller 直接 new PrismaClient，应依赖注入 userService
    this.db = new PrismaClient();
  }

  /**
   * 根据 ID 查询用户
   */
  async getUser(id: string) {
    // ❌ ARCH-001 违规：绕过 userService.get() 直接查询数据库
    return this.db.user.findUnique({ where: { id } });
  }
}
