import { logRepository } from "../db/index.js";

/**
 * Serializes DB log writes and reassembles stdout/stderr into full lines
 * so stream order stays correct (fixes interleaved / out-of-order log UI).
 */
export function createRunLogWriter(runId, ctx = {}) {
  let chain = Promise.resolve();
  let stdoutBuf = "";
  let stderrBuf = "";

  function enqueue(fn) {
    chain = chain.then(fn).catch(() => {});
    return chain;
  }

  async function write(message, extra = {}) {
    if (!runId || message == null) return;
    const text = String(message);
    if (!text) return;
    await logRepository.append({
      runId,
      message: text,
      stream: extra.stream || "events",
      level: extra.level || "info",
      tokenId: extra.tokenId ?? ctx.tokenId ?? null,
      username: extra.username ?? ctx.username ?? null,
      label: extra.label ?? ctx.label ?? null,
      meta: extra.meta ?? null,
    });
  }

  function log(message, extra = {}) {
    return enqueue(() => write(message, extra));
  }

  function classifyContainerLine(line, isStderr) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.trim()) return null;

    // Structured bot console logs → bot stream
    if (/^\[[^\]]+\]/.test(trimmed.trim())) {
      return {
        message: trimmed,
        stream: "bot",
        level: isStderr ? "warn" : "info",
      };
    }

    // npm/node lifecycle noise stays under docker
    return {
      message: trimmed,
      stream: "docker",
      level: isStderr ? "warn" : "info",
    };
  }

  function pushChunk(chunk, isStderr) {
    const text = String(chunk);
    if (isStderr) stderrBuf += text;
    else stdoutBuf += text;

    return enqueue(async () => {
      const key = isStderr ? "stderrBuf" : "stdoutBuf";
      let buf = isStderr ? stderrBuf : stdoutBuf;
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      if (isStderr) stderrBuf = buf;
      else stdoutBuf = buf;

      for (const part of parts) {
        const classified = classifyContainerLine(part, isStderr);
        if (classified) await write(classified.message, classified);
      }
    });
  }

  function flush() {
    return enqueue(async () => {
      for (const [buf, isStderr] of [
        [stdoutBuf, false],
        [stderrBuf, true],
      ]) {
        if (!buf.trim()) continue;
        const classified = classifyContainerLine(buf, isStderr);
        if (classified) await write(classified.message, classified);
      }
      stdoutBuf = "";
      stderrBuf = "";
    });
  }

  return { log, pushChunk, flush, drain: () => chain };
}
