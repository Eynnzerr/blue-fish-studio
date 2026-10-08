import type { EditorSettings, FontOption } from "../types";

/** Starting layout for the featured waving whale. */
export const DEFAULT_SETTINGS: EditorSettings = {
  text: "今天也要开心呀",
  x: 256,
  y: 72,
  fontSize: 54,
  fontFamily: "Maoken",
  color: "#3565ae",
  outlineColor: "#ffffff",
  outlineWidth: 9,
  rotation: -5,
  lineHeight: 62,
  letterSpacing: 0,
  curved: false,
  background: "transparent",
  layout: "caption",
};

/** Fonts that require no user upload. */
export const BUILTIN_FONTS: FontOption[] = [
  { family: "Maoken", label: "猫啃什锦黑" },
  { family: '"PingFang SC", "Microsoft YaHei", sans-serif', label: "系统黑体" },
  { family: '"Songti SC", "SimSun", serif', label: "系统宋体" },
];

/** Short captions offered as optional creative starting points. */
export const CAPTIONS = [
  "今天也要开心呀",
  "让我深度思考一下",
  "收到，鱼在处理了",
  "不想上班，只想摸鱼",
  "好耶！",
  "鱼已经很努力了",
];
