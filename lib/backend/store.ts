import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyState, type State } from "./types";
// One process, shared across Next route bundles and hot reloads. No provider work holds this lock.
const globals = globalThis as typeof globalThis & {
  digestStoreLocks?: Map<string, Promise<unknown>>;
};
const locks = (globals.digestStoreLocks ??= new Map());
export class JsonStore {
  constructor(public readonly path: string) {}
  async read(): Promise<State> {
    await locks.get(this.path);
    return this.load();
  }
  private async load(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(this.path, "utf8"));
      if (state.schemaVersion !== 1)
        throw new Error("Unsupported backend data version");
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw e; // Never overwrite unreadable or corrupted state with an empty profile.
    }
  }
  async update<T>(fn: (state: State) => T): Promise<T> {
    const work = (locks.get(this.path) ?? Promise.resolve()).then(async () => {
      const state = await this.load();
      const result = fn(state);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
        await rename(temp, this.path);
      } finally {
        await unlink(temp).catch(() => {});
      }
      return result;
    });
    locks.set(
      this.path,
      work.catch(() => {}),
    );
    return work;
  }
}
