import {
  AlignCenter,
  CaseSensitive,
  ChevronDown,
  RotateCcw,
  Shuffle,
  Type,
  Upload,
} from "lucide-react";
import { useId, useRef, useState, type ChangeEvent } from "react";
import { CAPTIONS, DEFAULT_SETTINGS } from "../lib/defaults";
import type { EditorSettings, FontOption } from "../types";

/** Choose six distinct suggestions without modifying the shared caption pool. */
function pickCaptionSuggestions(): string[] {
  const remaining = [...CAPTIONS];
  const suggestions: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const choice = Math.floor(Math.random() * remaining.length);
    suggestions.push(remaining.splice(choice, 1)[0]);
  }
  return suggestions;
}

/** A labeled range control with a live numeric value. */
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  /** Accessible control name. */ label: string;
  /** Current numeric setting. */ value: number;
  /** Lower bound. */ min: number;
  /** Upper bound. */ max: number;
  /** Increment. */ step?: number;
  /** Display suffix. */ unit?: string;
  /** Commit a new value. */ onChange: (value: number) => void;
}) {
  const inputId = useId();
  return (
    <label className="slider-control" htmlFor={inputId}>
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/** Caption editing controls, including font import and precise positioning. */
export default function Editor({
  settings,
  fonts,
  onChange,
  onFontUpload,
  onReset,
}: {
  /** Current canvas typography and layout. */ settings: EditorSettings;
  /** Fonts registered in this session. */ fonts: FontOption[];
  /** Merge a partial settings update. */ onChange: (
    patch: Partial<EditorSettings>,
  ) => void;
  /** Register an uploaded font locally. */ onFontUpload: (
    file: File,
  ) => Promise<void>;
  /** Restore the initial editor settings. */ onReset: () => void;
}) {
  const fontInput = useRef<HTMLInputElement>(null);
  // Keep the suggestions stable while the user edits the caption or its style.
  const [suggestions] = useState(pickCaptionSuggestions);

  /** Pick a caption different from the current one. */
  function shuffleCaption() {
    const options = CAPTIONS.filter((caption) => caption !== settings.text);
    onChange({ text: options[Math.floor(Math.random() * options.length)] });
  }

  /** Forward a font file and allow the same file to be chosen again. */
  function uploadFont(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onFontUpload(file);
    event.target.value = "";
  }

  return (
    <section className="editor-panel panel">
      <header className="panel-heading">
        <span className="step-badge">03</span>
        <div>
          <h2>配文字</h2>
        </div>
        <button
          className="icon-button reset-button"
          title="重置编辑设置"
          aria-label="重置编辑设置"
          onClick={onReset}
        >
          <RotateCcw size={18} />
        </button>
      </header>
      <div className="field-title">
        <label htmlFor="caption">表情文案</label>
        <button className="text-button" onClick={shuffleCaption}>
          <Shuffle size={14} />
          换句台词
        </button>
      </div>
      <div className="caption-field">
        <textarea
          id="caption"
          rows={3}
          maxLength={200}
          placeholder="这次让鱼说点什么？"
          value={settings.text}
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <div className="field-helper">
          <span>Enter 换行</span>
          <span>{settings.text.length} / 200</span>
        </div>
      </div>
      <div
        className="suggestions"
        role="group"
        aria-label="快捷文案，可横向滚动"
      >
        {suggestions.map((text) => (
          <button key={text} onClick={() => onChange({ text })}>
            {text}
          </button>
        ))}
      </div>
      <div className="field-title font-title">
        <label htmlFor="font">字体</label>
        <button
          className="text-button"
          onClick={() => fontInput.current?.click()}
        >
          <Upload size={14} />
          导入字体
        </button>
      </div>
      <div className="select-wrap">
        <Type size={18} />
        <select
          id="font"
          value={settings.fontFamily}
          onChange={(event) => onChange({ fontFamily: event.target.value })}
        >
          {fonts.map((font) => (
            <option key={font.family} value={font.family}>
              {font.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} />
      </div>
      <input
        ref={fontInput}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={uploadFont}
      />
      <div className="color-heading">
        <span>文字颜色</span>
        <button
          className="text-button"
          onClick={() => onChange({ color: DEFAULT_SETTINGS.color })}
        >
          恢复默认
        </button>
      </div>
      <div className="color-palette">
        {["#3565ae", "#202b43", "#df637e", "#9971bd", "#51a093", "#edaa42"].map(
          (color) => (
            <button
              key={color}
              className={`color-swatch ${settings.color === color ? "selected" : ""}`}
              style={{ background: color }}
              aria-label={`文字颜色 ${color}`}
              aria-pressed={settings.color === color}
              onClick={() => onChange({ color })}
            />
          ),
        )}
        <label className="custom-color" title="自定义文字颜色">
          <input
            type="color"
            aria-label="自定义文字颜色"
            value={settings.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
          <span>自定义</span>
        </label>
      </div>
      <Slider
        label="字号"
        value={settings.fontSize}
        min={16}
        max={120}
        unit=" px"
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <Slider
        label="旋转"
        value={settings.rotation}
        min={-90}
        max={90}
        unit="°"
        onChange={(rotation) => onChange({ rotation })}
      />
      <label className="switch-row">
        <span>
          <CaseSensitive size={20} />
          <span>
            弧形文字<small>沿弧线排列文字</small>
          </span>
        </span>
        <input
          role="switch"
          type="checkbox"
          checked={settings.curved}
          onChange={(event) => onChange({ curved: event.target.checked })}
        />
        <span className="switch-track" />
      </label>
      <details className="advanced-settings">
        <summary>
          <span>
            <AlignCenter size={17} />
            位置与精细排版
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="advanced-content">
          <Slider
            label="水平位置"
            value={settings.x}
            min={0}
            max={512}
            onChange={(x) => onChange({ x })}
          />
          <Slider
            label="垂直位置"
            value={settings.y}
            min={0}
            max={512}
            onChange={(y) => onChange({ y })}
          />
          <Slider
            label="行距"
            value={settings.lineHeight}
            min={16}
            max={150}
            unit=" px"
            onChange={(lineHeight) => onChange({ lineHeight })}
          />
          <Slider
            label="字距"
            value={settings.letterSpacing}
            min={-10}
            max={40}
            step={0.5}
            unit=" px"
            onChange={(letterSpacing) => onChange({ letterSpacing })}
          />
          <Slider
            label="描边粗细"
            value={settings.outlineWidth}
            min={0}
            max={24}
            unit=" px"
            onChange={(outlineWidth) => onChange({ outlineWidth })}
          />
          <label className="outline-color">
            描边颜色
            <input
              type="color"
              value={settings.outlineColor}
              onChange={(event) =>
                onChange({ outlineColor: event.target.value })
              }
            />
          </label>
        </div>
      </details>
    </section>
  );
}
