import { useCallback, useEffect, useRef, useState } from "react";

// Guard for destructive actions on a touch surface (quit, reset): a stray
// palm edge must not trigger them. The action only fires after the pointer
// has been held down for HOLD_MS; releasing or leaving earlier cancels.
// `holding` is exposed so the button can render "charging" feedback.
export const HOLD_MS = 600;

export function useLongPress(action, ms = HOLD_MS) {
  const timer = useRef(null);
  const [holding, setHolding] = useState(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      action();
    }, ms);
  }, [action, ms]);

  // Unmount safety: never fire into a component that is gone
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    holding,
    handlers: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
  };
}

// Tap-or-hold: short press fires onTap on RELEASE, holding for `ms` fires
// onHold instead (release after that is a no-op). Used by toggles: tap =
// send keys, hold = manual state correction WITHOUT sending keys.
//
// Trade-off, deliberately accepted: the tap moves from pointerDOWN (how
// momentary buttons fire, chosen for touch latency) to pointerUP - hold
// detection is impossible otherwise. A tap release is fast, so the added
// latency is small; dragging off the widget before release cancels, same
// guard semantics as useLongPress.
export function useTapOrHold(onTap, onHold, ms = HOLD_MS) {
  const timer = useRef(null);
  const [holding, setHolding] = useState(false);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null; // consumed - the following release is a no-op
      setHolding(false);
      onHold();
    }, ms);
  }, [onHold, ms]);

  const release = useCallback(() => {
    const wasTap = timer.current !== null; // hold not reached yet
    clear();
    if (wasTap) onTap();
  }, [clear, onTap]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    holding,
    handlers: {
      onPointerDown: start,
      onPointerUp: release,
      onPointerLeave: clear, // drag off = cancel, no tap
      onPointerCancel: clear,
    },
  };
}
