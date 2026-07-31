import { PrismaClient } from "@prisma/client";

class OrderController {
  private db: PrismaClient;

  constructor() {
    this.db = new PrismaClient();
  }

  // Controller 直接查数据库，违反 ARCH-001
  async getOrder(req: any, res: any) {
    const order = await this.db.order.findUnique({ where: { id: req.params.id } });
    res.json(order);
  }

  async getAllOrders(req: any, res: any) {
    const orders = await this.db.order.findMany();
    res.json(orders);
  }
}

export { OrderController };
