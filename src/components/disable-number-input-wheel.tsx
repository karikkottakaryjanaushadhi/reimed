"use client";

import { useEffect } from "react";

function isFocusedNumberInput(target: EventTarget | null): target is HTMLInputElement {
  return (
    target instanceof HTMLInputElement &&
    target.type === "number" &&
    document.activeElement === target
  );
}

/** Stops wheel and arrow keys from stepping `<input type="number">` values. */
export function DisableNumberInputWheel() {
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (!isFocusedNumberInput(event.target)) return;
      event.preventDefault();
      event.target.blur();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (!isFocusedNumberInput(event.target)) return;
      event.preventDefault();
    }

    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return null;
}
