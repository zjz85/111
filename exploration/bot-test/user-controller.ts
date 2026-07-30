import { PrismaClient } from "@prisma/client";

/**
 * 用户 Controller
 * 处理用户相关的 HTTP 请求
 */
export class UserController {
  private db: PrismaClient;

  constructor() {
    // ❌ ARCH-001 违规：Controller 直接实例化 PrismaClient
    this.db = new PrismaClient();
  }

  /**
   * 根据 ID 获取用户
   */
  async getUser(id: string) {
    // ❌ ARCH-001 违规：Controller 直连数据库查询
    const user = await this.db.user.findUnique({ where: { id } });
    return user;
  }

  /**
   * 创建新用户
   */
  async createUser(data: { name: string; email: string }) {
    // ❌ ARCH-001 违规：Controller 直接执行数据库写入
    const user = await this.db.user.create({ data });
    return user;
  }

  /**
   * 查询用户订单
   */
  async getUserOrders(userId: string) {
    // ❌ ARCH-001 违规：Controller 跨表直连查询
    const orders = await this.db.order.findMany({
      where: { userId },
      include: { items: true },
    });
    return orders;
  }
}
