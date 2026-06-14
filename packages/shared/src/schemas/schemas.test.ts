import { describe, it, expect } from "vitest";
import {
  GenerateContentSchema,
  GenerateHashtagSchema,
  GenerateImageSchema
} from "../index";

describe("AI generation schemas", () => {
  it("accepts a valid topic for content", () => {
    const out = GenerateContentSchema.parse({ topic: "summer launch" });
    expect(out.topic).toBe("summer launch");
  });

  it("rejects topics shorter than 3 chars", () => {
    expect(() => GenerateContentSchema.parse({ topic: "ab" })).toThrow();
    expect(() => GenerateHashtagSchema.parse({ topic: "x" })).toThrow();
    expect(() => GenerateImageSchema.parse({ topic: "" })).toThrow();
  });

  it("rejects topics longer than 500 chars", () => {
    const long = "a".repeat(501);
    expect(() => GenerateContentSchema.parse({ topic: long })).toThrow();
    expect(() => GenerateImageSchema.parse({ topic: long })).toThrow();
  });

  it("rejects missing topic", () => {
    expect(() => GenerateContentSchema.parse({})).toThrow();
    expect(() => GenerateHashtagSchema.parse({})).toThrow();
    expect(() => GenerateImageSchema.parse({})).toThrow();
  });

  it("rejects non-string topic", () => {
    expect(() =>
      GenerateContentSchema.parse({ topic: 42 })
    ).toThrow();
  });
});
