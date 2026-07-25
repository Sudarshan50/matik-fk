import { useEffect, useRef, useState } from "react";

/** Subscribe to admin SSE; call onEvent for messages. */
export function useLiveStream(onEvent) {
  const [live, setLive] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        onEventRef.current?.(evt);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, []);

  return live;
}
