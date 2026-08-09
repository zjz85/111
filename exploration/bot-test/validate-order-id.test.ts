import { describe, it, expect } from "vitest";
import { isValidOrderId } from "./validate-order-id";

describe("isValidOrderId", () => {
  it("should accept valid order id", () => {
    const r = isValidOrderId("ORD-12345678");
    expect(r.success).toBe(true);
    expect(r.code).toBe("OK");
  });

  it("should reject empty string", () => {
    const r = isValidOrderId("");
    expect(r.success).toBe(false);
    expect(r.code).toBe("INVALID_INPUT");
  });

  it("should reject wrong prefix", () => {
    const r = isValidOrderId("AB-12345678");
    expect(r.success).toBe(false);
    expect(r.code).toBe("INVALID_FORMAT");
  });

  it("should reject short number", () => {
    const r = isValidOrderId("ORD-123");
    expect(r.success).toBe(false);
    expect(r.code).toBe("INVALID_FORMAT");
  });
});
