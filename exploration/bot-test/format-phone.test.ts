import { describe, it, expect } from "vitest";
import { formatPhone } from "./format-phone";

describe("formatPhone", () => {
  it("should format valid phone number", () => {
    expect(formatPhone("13800138000")).toBe("138-0013-8000");
  });

  it("should reject empty string", () => {
    expect(formatPhone("")).toBeNull();
  });
});
