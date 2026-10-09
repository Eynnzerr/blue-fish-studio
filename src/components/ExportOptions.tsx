import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import type { ImageSize } from "../types";

/** Controls for selecting an output resolution without changing image content. */
interface ExportOptionsProps {
  /** Actual PNG dimensions displayed beside the export actions. */
  size: ImageSize;
  /** Longest-edge preset, or null for custom dimensions. */
  preset: number | null;
  /** Whether editing one axis should preserve the current canvas aspect. */
  locked: boolean;
  /** Current logical aspect, before integer output rounding. */
  aspect: number;
  /** Select a longest-edge preset or start custom input. */
  onPresetChange: (preset: number | null) => void;
  /** Change the aspect lock. */
  onLockedChange: (locked: boolean) => void;
  /** Commit valid integer dimensions. */
  onSizeChange: (size: ImageSize) => void;
  /** Suspend export while either input is incomplete or out of range. */
  onValidityChange: (valid: boolean) => void;
}

/** Largest supported PNG dimension on either axis. */
const MAX_EXPORT_SIZE = 4096;

/** Select presets or edit exact dimensions, retaining incomplete input while typing. */
export default function ExportOptions({
  size,
  preset,
  locked,
  aspect,
  onPresetChange,
  onLockedChange,
  onSizeChange,
  onValidityChange,
}: ExportOptionsProps) {
  const [draft, setDraft] = useState({
    width: String(size.width),
    height: String(size.height),
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft({ width: String(size.width), height: String(size.height) });
    setError("");
    onValidityChange(true);
  }, [size.width, size.height, preset, onValidityChange]);

  /** Validate both axes before committing dimensions or allocating a canvas. */
  function editDimension(axis: keyof ImageSize, value: string): void {
    const next = { ...draft, [axis]: value };
    const numeric = Number(value);
    if (locked && value !== "" && Number.isFinite(numeric) && numeric > 0) {
      if (axis === "width")
        next.height = String(Math.max(1, Math.round(numeric / aspect)));
      else next.width = String(Math.max(1, Math.round(numeric * aspect)));
    }
    setDraft(next);
    const dimensions = {
      width: Number(next.width),
      height: Number(next.height),
    };
    const valid = Object.values(dimensions).every(
      (dimension) =>
        Number.isInteger(dimension) &&
        dimension >= 1 &&
        dimension <= MAX_EXPORT_SIZE,
    );
    setError(valid ? "" : `宽和高均需为 1–${MAX_EXPORT_SIZE} 之间的整数`);
    onValidityChange(valid);
    if (valid) onSizeChange(dimensions);
  }

  return (
    <div className="export-settings">
      <div className="export-settings-heading">
        <label htmlFor="export-resolution">导出尺寸</label>
        <select
          id="export-resolution"
          value={preset ?? "custom"}
          onChange={(event) =>
            onPresetChange(
              event.target.value === "custom"
                ? null
                : Number(event.target.value),
            )
          }
        >
          <option value={512}>长边 512 px · 标准</option>
          <option value={1024}>长边 1024 px · 高清</option>
          <option value={1536}>长边 1536 px · 超清</option>
          <option value="custom">自定义宽高</option>
        </select>
      </div>
      {preset === null && (
        <>
          <div className="export-custom-size">
            <label>
              宽
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_EXPORT_SIZE}
                step={1}
                value={draft.width}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "export-size-error" : undefined}
                onChange={(event) => editDimension("width", event.target.value)}
              />
              <span>px</span>
            </label>
            <span aria-hidden="true">×</span>
            <label>
              高
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_EXPORT_SIZE}
                step={1}
                value={draft.height}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "export-size-error" : undefined}
                onChange={(event) =>
                  editDimension("height", event.target.value)
                }
              />
              <span>px</span>
            </label>
          </div>
          <label className="export-aspect-lock">
            <input
              type="checkbox"
              checked={locked}
              onChange={(event) => onLockedChange(event.target.checked)}
            />
            {locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
            锁定画布比例
          </label>
          {!locked && (
            <p className="export-size-hint">修改宽高会同步调整画布形状。</p>
          )}
        </>
      )}
      {error ? (
        <p className="export-size-error" id="export-size-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="export-size-hint">
          导出 {size.width} × {size.height} px PNG
        </p>
      )}
    </div>
  );
}
