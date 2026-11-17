// Typed, bounded subprocess adapter for the independent native Live observer.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
export class NativeClient {
  constructor({ edits = false } = {}) {
    this.pending = new Map();
    this.next = 0;
    this.closed = false;
    const script = fileURLToPath(
      new URL("./native-driver.py", import.meta.url),
    );
    this.process = spawn(
      process.env.POCKET_LIVE_PYTHON || "python3",
      [script, ...(edits ? ["--allow-live-edits"] : [])],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    this.process.stderr.on("data", () => {});
    this.process.stdin.on("error", () => {});
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        return;
      }
      if (!response || typeof response !== "object" || Array.isArray(response)) return;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      response.ok
        ? pending.resolve(response.result)
        : pending.reject(
            Error(response.error?.message || "Native operation failed"),
          );
    });
    const stopped = () => {
      this.closed = true;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error("Native driver stopped"));
      }
      this.pending.clear();
    };
    this.process.on("error", stopped);
    this.process.on("exit", stopped);
  }
  call(op, args = {}) {
    if (this.closed) return Promise.reject(Error("Native driver unavailable"));
    if (this.pending.size >= 64) return Promise.reject(Error("Native request queue is full"));
    return new Promise((resolve, reject) => {
      const id = ++this.next,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Error("Native deadline: " + op));
        }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      const fail = () => {
        const request = this.pending.get(id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(id);
        request.reject(Error("Native driver write failed"));
      };
      try {
        const line = JSON.stringify({ ...args, id, op }) + "\n";
        if (Buffer.byteLength(line) > 65536) throw Error("Request too large");
        this.process.stdin.write(line, error => { if (error) fail(); });
      } catch { fail(); }
    });
  }
  async close() {
    if (this.closed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.process.kill();
        resolve();
      }, 3000);
      this.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      this.process.stdin.end();
    });
  }
}
