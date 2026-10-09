import { Crop, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type PercentCrop,
} from "react-image-crop";
import type { ImageCrop } from "../types";
import "react-image-crop/dist/ReactCrop.css";
import "./CropDialog.css";

/** Inputs for a modal that edits a selection on the original source image. */
interface CropDialogProps {
  /** Decoded original image; cropping never replaces its bytes. */
  image: HTMLImageElement;
  /** Previously applied percentage selection, or the complete image. */
  crop: ImageCrop | null;
  /** Commit the selection; null restores the complete image. */
  onApply: (crop: ImageCrop | null) => void;
  /** Discard the draft selection and close the modal. */
  onClose: () => void;
}

/** Complete original image in the percentage coordinate system. */
const FULL_CROP: PercentCrop = {
  unit: "%",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

/** Crop with touch, mouse, or keyboard while keeping the original recoverable. */
export default function CropDialog({
  image,
  crop,
  onApply,
  onClose,
}: CropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PercentCrop>(
    crop ? { ...crop, unit: "%" } : FULL_CROP,
  );
  const [ratio, setRatio] = useState("free");
  const aspect =
    ratio === "free"
      ? undefined
      : ratio === "original"
        ? image.naturalWidth / image.naturalHeight
        : Number(ratio);
  const width = Math.round((image.naturalWidth * draft.width) / 100);
  const height = Math.round((image.naturalHeight * draft.height) / 100);

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  /** Fit a centered selection to the requested ratio using original-image dimensions. */
  function changeRatio(value: string): void {
    setRatio(value);
    if (value === "free") return;
    const nextAspect =
      value === "original"
        ? image.naturalWidth / image.naturalHeight
        : Number(value);
    setDraft(
      centerCrop(
        makeAspectCrop(
          { unit: "%", width: 100 },
          nextAspect,
          image.naturalWidth,
          image.naturalHeight,
        ),
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }

  /** Store percentages so reopening and responsive resizing use the same source area. */
  function applyCrop(): void {
    const { x, y, width: cropWidth, height: cropHeight } = draft;
    onApply(
      x === 0 && y === 0 && cropWidth === 100 && cropHeight === 100
        ? null
        : { x, y, width: cropWidth, height: cropHeight },
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="crop-dialog"
      aria-labelledby="crop-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="crop-heading">
        <Crop size={23} />
        <div>
          <h2 id="crop-title">裁剪底图</h2>
          <p>拖动选框或边角，保留你想要的部分。</p>
        </div>
        <button className="icon-button" aria-label="关闭裁剪" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="crop-body">
        <div className="crop-controls">
          <label>
            裁剪比例
            <select
              value={ratio}
              onChange={(event) => changeRatio(event.target.value)}
            >
              <option value="free">自由比例</option>
              <option value="original">原图比例</option>
              <option value="1">1:1 · 正方形</option>
              <option value={4 / 3}>4:3 · 横向</option>
              <option value={3 / 4}>3:4 · 竖向</option>
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setRatio("free");
              setDraft(FULL_CROP);
            }}
          >
            <RotateCcw size={15} />
            恢复完整底图
          </button>
        </div>
        <div className="crop-image-stage">
          <ReactCrop
            crop={draft}
            aspect={aspect}
            onChange={(_, percentCrop) => setDraft(percentCrop)}
            keepSelection
            ruleOfThirds
            ariaLabels={{
              cropArea: "使用方向键移动裁剪选区",
              nwDragHandle: "使用方向键调整左上角",
              nDragHandle: "使用上下方向键调整上边缘",
              neDragHandle: "使用方向键调整右上角",
              eDragHandle: "使用左右方向键调整右边缘",
              seDragHandle: "使用方向键调整右下角",
              sDragHandle: "使用上下方向键调整下边缘",
              swDragHandle: "使用方向键调整左下角",
              wDragHandle: "使用左右方向键调整左边缘",
            }}
          >
            <img src={image.src} alt="待裁剪的完整底图" draggable={false} />
          </ReactCrop>
        </div>
        <p className="crop-hint">
          选区 {width} × {height} px ·
          原图保留，可随时重新裁剪。支持方向键微调。
        </p>
      </div>
      <footer className="crop-actions">
        <button className="button button-outlined" onClick={onClose}>
          取消
        </button>
        <button
          className="button button-primary"
          disabled={width < 1 || height < 1}
          onClick={applyCrop}
        >
          应用裁剪
        </button>
      </footer>
    </dialog>
  );
}
