import { useEffect, useRef, useState } from "react";
import type { PublicReceipt } from "./api";
import { WS_URL } from "./api";

export function useReceiptLive(
  receiptId: string | undefined,
  onUpdate: (receipt: PublicReceipt) => void
) {
  const [live, setLive] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    if (!receiptId) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(`${WS_URL}?receiptId=${receiptId}`);
      ws.onopen = () => {
        setLive(true);
        setReconnecting(false);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.receipt) cb.current(msg.receipt as PublicReceipt);
        } catch {}
      };
      ws.onclose = () => {
        setLive(false);
        if (!closed) {
          setReconnecting(true);
          timer = setTimeout(connect, 2500);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [receiptId]);

  return { live, reconnecting };
}
