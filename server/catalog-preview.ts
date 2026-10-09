import {
  createCanvas,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import type { Sticker } from "../src/types.ts";

/** A bundled catalog entry paired with its decoded local thumbnail. */
export interface CatalogPreviewItem {
  /** Name and provenance displayed below the thumbnail. */
  sticker: Sticker;
  /** Decoded image loaded from the catalog's preview path. */
  image: Image;
}

/** Width of every catalog image, large enough to read two cards on a phone. */
const SHEET_WIDTH = 960;
/** Outer horizontal margin around the card grid. */
const SHEET_MARGIN = 28;
/** Space between adjacent rows or columns. */
const CARD_GAP = 20;
/** Height reserved for one thumbnail, its number, name, and source. */
const CARD_HEIGHT = 464;
/** Space for the title above the first card row. */
const HEADER_HEIGHT = 130;
/** Space for the command hint below the last card row. */
const FOOTER_HEIGHT = 90;

/** Fit a single-line label into the available width without splitting Unicode characters. */
function fitLabel(
  context: SKRSContext2D,
  label: string,
  maximumWidth: number,
): string {
  if (context.measureText(label).width <= maximumWidth) return label;
  const characters = Array.from(label);
  while (
    characters.length > 0 &&
    context.measureText(`${characters.join("")}…`).width > maximumWidth
  ) {
    characters.pop();
  }
  return `${characters.join("")}…`;
}

/** Draw one numbered card with an uncropped image and explicit collection attribution. */
function drawCard(
  context: SKRSContext2D,
  item: CatalogPreviewItem,
  index: number,
): void {
  const width = (SHEET_WIDTH - SHEET_MARGIN * 2 - CARD_GAP) / 2;
  const x = SHEET_MARGIN + (index % 2) * (width + CARD_GAP);
  const y = HEADER_HEIGHT + Math.floor(index / 2) * (CARD_HEIGHT + CARD_GAP);

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.roundRect(x, y, width, CARD_HEIGHT, 26);
  context.fill();

  context.fillStyle = "#dceaff";
  context.beginPath();
  context.roundRect(x + 16, y + 14, 58, 42, 15);
  context.fill();
  context.fillStyle = "#285aa1";
  context.font = '32px "Maoken"';
  context.textAlign = "center";
  context.fillText(String(index + 1), x + 45, y + 47);

  const imageX = x + 16;
  const imageY = y + 66;
  const imageWidth = width - 32;
  const imageHeight = 306;
  context.save();
  context.beginPath();
  context.roundRect(imageX, imageY, imageWidth, imageHeight, 16);
  context.clip();
  context.fillStyle = "#f4f7fb";
  context.fillRect(imageX, imageY, imageWidth, imageHeight);
  context.fillStyle = "#eaf0f7";
  for (let row = 0; row * 20 < imageHeight; row += 1) {
    for (let column = 0; column * 20 < imageWidth; column += 1) {
      if ((row + column) % 2 === 0) {
        context.fillRect(imageX + column * 20, imageY + row * 20, 20, 20);
      }
    }
  }
  // Preserve the entire image; transparent pixels reveal the neutral checkerboard.
  const scale = Math.min(
    (imageWidth - 16) / item.image.width,
    (imageHeight - 16) / item.image.height,
  );
  const drawingWidth = item.image.width * scale;
  const drawingHeight = item.image.height * scale;
  context.drawImage(
    item.image,
    imageX + (imageWidth - drawingWidth) / 2,
    imageY + (imageHeight - drawingHeight) / 2,
    drawingWidth,
    drawingHeight,
  );
  context.restore();

  context.textAlign = "left";
  context.fillStyle = "#213c60";
  context.font = '27px "Maoken"';
  context.fillText(
    fitLabel(context, item.sticker.name, width - 40),
    x + 20,
    y + 412,
  );
  context.fillStyle = "#657b97";
  context.font = '21px "Maoken"';
  const source = item.sticker.origin === "archive" ? "档案馆" : "工坊";
  context.fillText(source, x + 20, y + 444);
}

/** Encode a two-column catalog PNG with sequential numbers for one to eight validated items. */
export async function renderCatalogPreview(
  items: CatalogPreviewItem[],
): Promise<Buffer> {
  const rows = Math.ceil(items.length / 2);
  const height =
    HEADER_HEIGHT + rows * CARD_HEIGHT + (rows - 1) * CARD_GAP + FOOTER_HEIGHT;
  const canvas = createCanvas(SHEET_WIDTH, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#edf4ff";
  context.fillRect(0, 0, SHEET_WIDTH, height);
  context.fillStyle = "#285aa1";
  context.font = '44px "Maoken"';
  context.fillText("肥鱼素材", SHEET_MARGIN + 4, 64);
  context.fillStyle = "#657b97";
  context.font = '24px "Maoken"';
  context.fillText("看图选编号，把想说的话交给肥鱼", SHEET_MARGIN + 4, 103);

  items.forEach((item, index) => drawCard(context, item, index));

  context.fillStyle = "#285aa1";
  context.font = '28px "Maoken"';
  context.fillText("用法  /肥鱼 1 想说的话", SHEET_MARGIN + 4, height - 34);
  return canvas.encode("png");
}
