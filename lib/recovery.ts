import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, sep } from "node:path";

export async function reserveAndSave(
  active: Set<string>,
  id: string,
  persist: () => Promise<void>,
) {
  active.add(id);
  try {
    await persist();
  } catch (error) {
    active.delete(id);
    throw error;
  }
}

export async function validArtifacts(
  files: unknown,
  root: string,
): Promise<boolean> {
  if (
    !Array.isArray(files) ||
    files.length !== 3 ||
    files.some(
      (p) =>
        typeof p !== "string" || !resolve(p).startsWith(resolve(root) + sep),
    )
  )
    return false;
  if (
    ![".mp4", ".transcript.en.txt", ".transcript.en.timestamped.txt"].every(
      (ext) => files.filter((p) => p.endsWith(ext)).length === 1,
    )
  )
    return false;
  try {
    for (const file of files) {
      await access(file, constants.R_OK);
      const s = await stat(file);
      if (!s.isFile() || s.size === 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}
