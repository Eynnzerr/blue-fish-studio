import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { CANVAS_SIZE, renderSticker } from "../lib/canvas";
import type { Composition, EditorSettings } from "../types";

/** Inputs for the shared canvas preview and direct caption positioning. */
export interface StickerCanvasProps {
  /** Decoded source image, or null before an image is available. */
  image: HTMLImageElement | null;
  /** Current typography with relative caption positions. */
  settings: EditorSettings;
  /** Canvas dimensions and source crop shared with export. */
  composition: Composition;
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
  composition,
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
        renderSticker(canvasRef.current, image, settings, composition);
    };
    redraw();
    document.fonts.ready.then(redraw);
    document.fonts.addEventListener("loadingdone", redraw);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", redraw);
    };
  }, [canvasRef, image, settings, composition, loading]);

  /** Converts CSS pixels into independent 512-unit position axes for any canvas ratio. */
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
    <div
      className="canvas-frame"
      aria-busy={loading}
      style={{ aspectRatio: composition.width / composition.height }}
    >
      <canvas
        ref={canvasRef}
        className="sticker-canvas"
        width={Math.round(composition.width)}
        height={Math.round(composition.height)}
        role="img"
        aria-label={`表情包预览${settings.text ? `：${settings.text}` : ""}。可用文字位置滑块调整文字。`}
        title="点击或拖动画布调整文字位置"
        style={{
          touchAction: "none",
          userSelect: "none",
          aspectRatio: composition.width / composition.height,
        }}
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
