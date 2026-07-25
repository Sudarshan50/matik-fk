import { useEffect, useRef } from "react";
import { levelClass } from "../lib/format.js";

export default function LogConsole({
  lines,
  empty = "No log lines yet.",
  stickBottom = true,
}) {
  const ref = useRef(null);
  const prevLen = useRef(0);

  useEffect(() => {
    if (!stickBottom || !ref.current || !lines?.length) return;
    if (lines.length >= prevLen.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
    prevLen.current = lines.length;
  }, [lines, stickBottom]);

  if (!lines) {
    return <div className="log-console is-empty">Loading logs…</div>;
  }
  if (!lines.length) {
    return <div className="log-console is-empty">{empty}</div>;
  }

  return (
    <div className="log-console" ref={ref}>
      {lines.map((line) => (
        <div key={line.id} className={`log-line ${levelClass(line.level)}`}>
          <time dateTime={line.at}>
            {new Date(line.at).toLocaleTimeString()}
          </time>
          <span className="log-stream">{line.stream}</span>
          <span className="log-msg">{line.message}</span>
        </div>
      ))}
    </div>
  );
}
