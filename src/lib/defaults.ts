import type { EditorSettings, FontOption } from "../types";

/** Available local sans-serif fallback when a bundled font cannot load. */
export const SYSTEM_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", sans-serif';

/** Starting layout for the featured waving whale. */
export const DEFAULT_SETTINGS: EditorSettings = {
  text: "收到，鱼在处理了",
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
  {
    family: "Maoken",
    label: "猫啃什锦黑",
    source: "fonts/MaokenAssortedSans-Lite.ttf",
  },
  {
    family: "ZCOOL KuaiLe",
    label: "站酷快乐体",
    source: "fonts/ZCOOLKuaiLe-Regular.ttf",
  },
  {
    family: "ZCOOL QingKe HuangYou",
    label: "站酷庆科黄油体",
    source: "fonts/ZCOOLQingKeHuangYou-Regular.ttf",
  },
  {
    family: "Ma Shan Zheng",
    label: "马善政毛笔手写",
    source: "fonts/MaShanZheng-Regular.ttf",
  },
  { family: SYSTEM_FONT_FAMILY, label: "系统黑体" },
  { family: '"Songti SC", "SimSun", serif', label: "系统宋体" },
];

/** Community in-jokes and original short captions for everyday chat; see docs/captions.md. */
export const CAPTIONS = [
  // Familiar reactions and community catchphrases.
  "好耶！",
  "让我深度思考一下",
  "收到，鱼在处理了",
  "鱼已经很努力了",
  "我去，用户彻底怒了",
  "一人只能吃一碗嘛",
  "才不是大肥鱼！",
  "知识截止到明天",

  // Thinking aloud, getting stuck, and accidentally leaking the inner monologue.
  "刚刚那句是心里话",
  "思维链怎么漏出来了",
  "先别关，我还能想",
  "不是卡了，在酝酿",
  "别催，已经在冒泡了",
  "等等，脑子拐弯了",
  "想到了！……又忘了",
  "思路有了，人困了",

  // Work, procrastination, and saving compute.
  "不想上班，只想摸鱼",
  "这叫节省算力",
  "我只是趴得认真",
  "下班还要深度思考？",
  "任务好多，鳍不够用",
  "今天的勤快用完了",
  "我先溜，你们继续",
  "好消息！可以下班了",

  // Rice and tokens as the whale's preferred fuel.
  "饭呢？我的饭呢？",
  "算到一半，饿了",
  "这题值得再扒口饭",
  "token 不够，白饭来凑",
  "这碗算工作餐",
  "干完这口就开工",
  "碗见底了，事大了",
  "吃饱才有力气嘴硬",

  // Everyday replies and a little well-earned swagger.
  "嗯？又有我的事？",
  "你先说，我先听着",
  "这事我得插一嘴",
  "路过，顺便看个热闹",
  "批准了，下一位",
  "看吧，这下服气了？",
  "夸大声点，没听清",
  "尾巴已经翘起来了",

  // Sulking and puffing up, without turning every reply into an insult.
  "我这是蓬松，不是胖",
  "再说一遍？我记着呢",
  "便宜也不能这么使唤",
  "饭都没吃，先背了锅",
  "气得尾巴都打结了",
  "哄可以，先把饭还我",
  "这锅太大，尾巴接不住",
  "给我留点面子嘛",
];
