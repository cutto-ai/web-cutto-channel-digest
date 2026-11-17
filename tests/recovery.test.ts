import { it, expect } from "bun:test";
import { mkdtemp, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveAndSave, validArtifacts } from "../lib/recovery";
it("releases a reservation after disk failure and permits retry", async () => {
  const active = new Set<string>();
  await expect(
    reserveAndSave(active, "job", async () => {
      throw new Error("disk full");
    }),
  ).rejects.toThrow("disk full");
  expect(active.size).toBe(0);
  await reserveAndSave(active, "job", async () => {});
  expect(active.has("job")).toBe(true);
});
it("rejects a cache when its video is missing even if transcripts survive", async () => {
  const root = await mkdtemp(join(tmpdir(), "digest-cache-"));
  try {
    const files = [
      "v.mp4",
      "v.transcript.en.txt",
      "v.transcript.en.timestamped.txt",
    ].map((p) => join(root, p));
    await Promise.all(files.map((p) => writeFile(p, "fixture")));
    expect(await validArtifacts(files, root)).toBe(true);
    await unlink(files[0]);
    expect(await validArtifacts(files, root)).toBe(false);
    expect(
      await validArtifacts([...files.slice(1), "/outside/v.mp4"], root),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
