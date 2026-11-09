import { describe, expect, it } from "vitest";
import { barcodeCandidates } from "./barcode";

describe("barcodeCandidates", () => {
  it("trims input", () => {
    expect(barcodeCandidates(" 8801234567890 ")).toEqual(["8801234567890"]);
  });
  it("UPC-A also matches EAN-13 with a leading zero", () => {
    expect(barcodeCandidates("012345678905")).toEqual(["012345678905", "0012345678905"]);
  });
  it("EAN-13 with a leading zero also matches UPC-A", () => {
    expect(barcodeCandidates("0012345678905")).toEqual(["0012345678905", "012345678905"]);
  });
  it("leaves non-numeric codes alone", () => {
    expect(barcodeCandidates("ABC-123")).toEqual(["ABC-123"]);
  });
});
