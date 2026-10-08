import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { CANVAS_SIZE, renderSticker } from "../lib/canvas";
import type { EditorSettings } from "../types";

/** Inputs for the shared canvas preview and direct caption positioning. */
export interface StickerCanvasProps {
  /** Decoded source image, or null before an image is available. */
  image: HTMLImageElement | null;
  /** Current composition in 512 × 512 logical coordinates. */
  settings: EditorSettings;
  /** Receives the caption anchor after a pointer interaction. */
  onPositionChange: (x: number, y: number) => void;
  /** Exposes the displayed canvas to image export and clipboard actions. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Shows progress and suspends dragging while the source image or font loads. */
  loading: boolean;
}

/** Renders the sticker and maps pointer gestures back into logical image coordinates. */
export function StickerCanvas({
  image,
  settings,
  onPositionChange,
  canvasRef,
  loading,
}: StickerCanvasProps) {
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    /** Refreshes the preview after settings or font availability changes. */
    const redraw = () => {
      if (!cancelled && canvasRef.current)
        renderSticker(canvasRef.current, image, settings);
    };
    redraw();
    document.fonts.ready.then(redraw);
    document.fonts.addEventListener("loadingdone", redraw);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", redraw);
    };
  }, [canvasRef, image, settings, loading]);

  /** Converts CSS pixels into the canvas coordinate system, including scaled previews. */
  const positionFromPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * CANVAS_SIZE;
    const y = ((event.clientY - bounds.top) / bounds.height) * CANVAS_SIZE;
    onPositionChange(
      Math.round(Math.max(0, Math.min(CANVAS_SIZE, x))),
      Math.round(Math.max(0, Math.min(CANVAS_SIZE, y))),
    );
  };

  /** Starts a captured drag and makes a single click reposition the caption too. */
  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!image || loading || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    positionFromPointer(event);
  };

  /** Finishes an active gesture and releases its pointer capture. */
  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="canvas-frame" aria-busy={loading}>
      <canvas
        ref={canvasRef}
        className="sticker-canvas"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        role="img"
        aria-label={`表情包预览${settings.text ? `：${settings.text}` : ""}。可用文字位置滑块调整文字。`}
        title="点击或拖动画布调整文字位置"
        style={{ touchAction: "none", userSelect: "none" }}
        onPointerDown={startDrag}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId)
            positionFromPointer(event);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          activePointer.current = null;
        }}
      >
        {settings.text || "表情包预览"}
      </canvas>
      {loading && (
        <div className="canvas-loading" role="status">
          正在载入底图或字体…
        </div>
      )}
    </div>
  );
}
