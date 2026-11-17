import { describe, it, expect } from "bun:test";
import {
  parseTranscript,
  validateHighlights,
  parseJson,
} from "../lib/contracts";
describe("grounded timestamps", () => {
  it("preserves transcript text and real boundaries", () => {
    const s = parseTranscript(
      "[00:00:00.000] One\n[00:00:20.000] Two\n[00:01:00.000] Three",
      90,
    );
    expect(s.flatMap((x) => x.text).join(" ")).toBe("One Two Three");
    expect(s.at(-1)?.end).toBe(90);
  });
  it("rejects invented IDs and reversed spans", () => {
    const s = [{ id: 0, start: 0, end: 20, text: "Source" }];
    expect(() =>
      validateHighlights(
        [{ startSegmentId: 7, endSegmentId: 7, title: "x", reason: "y" }],
        s,
      ),
    ).toThrow();
  });
  it("returns source timestamps rather than model timestamps", () => {
    const h = validateHighlights(
      [
        {
          startSegmentId: 0,
          endSegmentId: 0,
          start: 999,
          title: "x",
          reason: "y",
        },
      ],
      [{ id: 0, start: 12, end: 24, text: "Evidence" }],
    );
    expect(h[0].start).toBe(12);
    expect(h[0].evidence).toBe("Evidence");
  });
  it("allows no relevant matches", () =>
    expect(validateHighlights([], [])).toEqual([]));
  it("rejects broken transcripts", () =>
    expect(() =>
      parseTranscript("[00:02:00.000] out of bounds", 90),
    ).toThrow());
  it("accepts fenced JSON but rejects extra prose", () => {
    expect(parseJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(() => parseJson('Here is a result {"ok":true}')).toThrow();
  });
});
