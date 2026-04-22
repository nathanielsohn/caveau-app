/**
 * PDF renderer for the Welcome appraisal document (feature #61).
 *
 * Uses pdf-lib with standard fonts so it runs unchanged on Vercel
 * serverless. Deliberately plain — US Letter, single column, mirrors the
 * CCR provenance PDF layout at `provenance-pdf.ts` so the member sees a
 * consistent vault-deliverable aesthetic across document types.
 *
 * Inputs are all plain scalars + the serialized line items — no Prisma
 * Decimals, no relations. The caller (admin completion action or member
 * PDF API) shapes the payload first.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type {
  AppraisalLineItem,
  AppraisalHeir,
} from "./appraisals";
import {
  BASIS_LABELS,
  PURPOSE_LABELS,
} from "./appraisals";
import type {
  AppraisalBasis,
  AppraisalPurpose,
} from "@prisma/client";
import { formatCurrency, formatDate } from "./utils";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GOLD = rgb(0.78, 0.62, 0.05);
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.48);

interface RenderState {
  doc: PDFDocument;
  page: PDFPage;
  cursor: number;
  serif: PDFFont;
  serifBold: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
  mono: PDFFont;
}

export interface AppraisalPdfInput {
  appraisalNumber: string;
  memberName: string;
  purpose: AppraisalPurpose;
  basis: AppraisalBasis;
  effectiveDate: Date;
  appraiserName: string;
  appraiserCreds: string | null;
  scopeOfWork: string | null;
  bottleCount: number;
  totalBasisUsd: number;
  lineItems: AppraisalLineItem[];
  heirs: AppraisalHeir[];
  dataIntegrityHash: string;
  verifyUrl: string;
  isWelcomeAppraisal: boolean;
}

export async function renderAppraisalPdf(
  input: AppraisalPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Caveau Appraisal — ${input.appraisalNumber}`);
  doc.setAuthor("Caveau");
  doc.setSubject(
    `Caveau Appraisal — ${PURPOSE_LABELS[input.purpose]} · ${input.appraisalNumber}`,
  );
  doc.setProducer("Caveau appraisal-pdf");
  doc.setCreator("Caveau");

  const state: RenderState = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    cursor: PAGE_HEIGHT - MARGIN,
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    body: await doc.embedFont(StandardFonts.Helvetica),
    bodyBold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  drawHeader(state, input);
  drawMemberAndPurpose(state, input);
  drawAppraiser(state, input);
  drawSummary(state, input);
  drawLineItems(state, input);
  if (input.heirs.length > 0) drawHeirs(state, input);
  drawSignature(state, input);

  return doc.save();
}

function drawHeader(s: RenderState, input: AppraisalPdfInput) {
  drawCentered(s, "CAVEAU", s.serifBold, 22, INK);
  s.cursor -= 4;
  drawCentered(s, "APPRAISAL", s.body, 9, GOLD, 2.5);
  s.cursor -= 18;
  drawHr(s);
  s.cursor -= 18;
  drawCentered(s, input.appraisalNumber, s.bodyBold, 10, INK);
  s.cursor -= 14;
  drawCentered(
    s,
    `Effective ${formatDate(input.effectiveDate)}`,
    s.body,
    9,
    MUTED,
  );
  if (input.isWelcomeAppraisal) {
    s.cursor -= 12;
    drawCentered(s, "Founding Circle · Welcome Appraisal", s.body, 8, GOLD, 2);
  }
  s.cursor -= 24;
}

function drawMemberAndPurpose(s: RenderState, input: AppraisalPdfInput) {
  drawSectionLabel(s, "APPRAISED FOR");
  s.page.drawText(input.memberName, {
    x: MARGIN,
    y: s.cursor - 10,
    size: 14,
    font: s.serifBold,
    color: INK,
  });
  s.cursor -= 24;

  drawSectionLabel(s, "PURPOSE & BASIS");
  s.page.drawText(PURPOSE_LABELS[input.purpose], {
    x: MARGIN,
    y: s.cursor - 9,
    size: 10,
    font: s.bodyBold,
    color: INK,
  });
  s.page.drawText(BASIS_LABELS[input.basis], {
    x: MARGIN + CONTENT_WIDTH / 2,
    y: s.cursor - 9,
    size: 10,
    font: s.bodyBold,
    color: INK,
  });
  s.cursor -= 18;
  drawHr(s);
  s.cursor -= 18;
}

function drawAppraiser(s: RenderState, input: AppraisalPdfInput) {
  drawSectionLabel(s, "APPRAISER");
  s.page.drawText(input.appraiserName, {
    x: MARGIN,
    y: s.cursor - 9,
    size: 10,
    font: s.bodyBold,
    color: INK,
  });
  s.cursor -= 12;
  if (input.appraiserCreds) {
    for (const line of wrap(input.appraiserCreds, s.body, 9, CONTENT_WIDTH)) {
      s.page.drawText(line, {
        x: MARGIN,
        y: s.cursor - 8,
        size: 9,
        font: s.body,
        color: MUTED,
      });
      s.cursor -= 11;
    }
  }
  if (input.scopeOfWork) {
    s.cursor -= 4;
    for (const line of wrap(input.scopeOfWork, s.body, 9, CONTENT_WIDTH)) {
      ensureSpace(s, 12);
      s.page.drawText(line, {
        x: MARGIN,
        y: s.cursor - 8,
        size: 9,
        font: s.body,
        color: INK,
      });
      s.cursor -= 11;
    }
  }
  s.cursor -= 8;
  drawHr(s);
  s.cursor -= 18;
}

function drawSummary(s: RenderState, input: AppraisalPdfInput) {
  ensureSpace(s, 60);
  drawSectionLabel(s, "VALUATION SUMMARY");
  const cellW = CONTENT_WIDTH / 2;
  const top = s.cursor;
  const cells: Array<[string, string]> = [
    ["Bottles appraised", input.bottleCount.toLocaleString()],
    ["Total basis", formatCurrency(input.totalBasisUsd)],
  ];
  cells.forEach(([label, value], i) => {
    const x = MARGIN + cellW * i + 4;
    s.page.drawText(label.toUpperCase(), {
      x,
      y: top - 10,
      size: 7,
      font: s.body,
      color: MUTED,
    });
    s.page.drawText(value, {
      x,
      y: top - 28,
      size: 14,
      font: s.serifBold,
      color: INK,
    });
  });
  s.cursor = top - 42;
  drawHr(s);
  s.cursor -= 18;
}

function drawLineItems(s: RenderState, input: AppraisalPdfInput) {
  drawSectionLabel(s, "ITEMS APPRAISED");
  // Column layout: wine (flex), vintage (36w), value (right-aligned)
  const vintageX = MARGIN + CONTENT_WIDTH - 120;
  const valueRightX = MARGIN + CONTENT_WIDTH;

  // Header row
  s.page.drawText("WINE", {
    x: MARGIN,
    y: s.cursor - 8,
    size: 7,
    font: s.body,
    color: MUTED,
  });
  s.page.drawText("VINTAGE", {
    x: vintageX,
    y: s.cursor - 8,
    size: 7,
    font: s.body,
    color: MUTED,
  });
  const valueHeader = "VALUE";
  const valueHeaderW = s.body.widthOfTextAtSize(valueHeader, 7);
  s.page.drawText(valueHeader, {
    x: valueRightX - valueHeaderW,
    y: s.cursor - 8,
    size: 7,
    font: s.body,
    color: MUTED,
  });
  s.cursor -= 14;

  for (const line of input.lineItems) {
    ensureSpace(s, 22);

    // Row 1: producer · name (bold), vintage, value right-aligned
    const title = `${line.producer} · ${line.name}`;
    const titleMaxW = vintageX - MARGIN - 6;
    const titleLines = wrap(title, s.bodyBold, 9, titleMaxW);
    const firstTitle = titleLines[0] ?? title;

    s.page.drawText(firstTitle, {
      x: MARGIN,
      y: s.cursor - 8,
      size: 9,
      font: s.bodyBold,
      color: INK,
    });
    s.page.drawText(String(line.vintage), {
      x: vintageX,
      y: s.cursor - 8,
      size: 9,
      font: s.body,
      color: INK,
    });
    const valueText = formatCurrency(line.currentValueUsd);
    const valueW = s.bodyBold.widthOfTextAtSize(valueText, 9);
    s.page.drawText(valueText, {
      x: valueRightX - valueW,
      y: s.cursor - 8,
      size: 9,
      font: s.bodyBold,
      color: INK,
    });
    s.cursor -= 11;

    // Continuation lines for a wrapped title (rare — most producers/names fit)
    for (let i = 1; i < titleLines.length; i++) {
      ensureSpace(s, 11);
      const contLine = titleLines[i];
      if (!contLine) continue;
      s.page.drawText(contLine, {
        x: MARGIN,
        y: s.cursor - 8,
        size: 9,
        font: s.bodyBold,
        color: INK,
      });
      s.cursor -= 11;
    }

    // Row 2: region + varietal + optional CCR anchor
    const region =
      line.region && line.varietal
        ? `${line.region} · ${line.varietal}`
        : line.region || line.varietal || "";
    if (region) {
      s.page.drawText(region, {
        x: MARGIN,
        y: s.cursor - 8,
        size: 8,
        font: s.body,
        color: MUTED,
      });
    }
    if (line.ccrAnchor) {
      const anchor = `Custody anchor: CCR ${line.ccrAnchor}`;
      const anchorW = s.body.widthOfTextAtSize(anchor, 8);
      s.page.drawText(anchor, {
        x: valueRightX - anchorW,
        y: s.cursor - 8,
        size: 8,
        font: s.body,
        color: GOLD,
      });
    }
    s.cursor -= 12;
  }

  s.cursor -= 6;
  drawHr(s);
  s.cursor -= 18;
}

function drawHeirs(s: RenderState, input: AppraisalPdfInput) {
  ensureSpace(s, 40);
  drawSectionLabel(s, "ESTATE HEIRS & SHARES");
  for (const heir of input.heirs) {
    ensureSpace(s, 14);
    s.page.drawText(heir.name, {
      x: MARGIN,
      y: s.cursor - 8,
      size: 10,
      font: s.bodyBold,
      color: INK,
    });
    const shareW = s.body.widthOfTextAtSize(heir.share, 10);
    s.page.drawText(heir.share, {
      x: MARGIN + CONTENT_WIDTH - shareW,
      y: s.cursor - 8,
      size: 10,
      font: s.body,
      color: INK,
    });
    s.cursor -= 14;
  }
  s.cursor -= 4;
  drawHr(s);
  s.cursor -= 18;
}

function drawSignature(s: RenderState, input: AppraisalPdfInput) {
  ensureSpace(s, 80);
  drawSectionLabel(s, "DATA INTEGRITY (HMAC-SHA256)");
  const lines = wrapMonospace(input.dataIntegrityHash, s.mono, 8, CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(s, 11);
    s.page.drawText(line, {
      x: MARGIN,
      y: s.cursor - 9,
      size: 8,
      font: s.mono,
      color: INK,
    });
    s.cursor -= 11;
  }
  s.cursor -= 8;
  for (const verifyLine of wrap(
    `Verify at ${input.verifyUrl}`,
    s.body,
    8,
    CONTENT_WIDTH,
  )) {
    ensureSpace(s, 10);
    s.page.drawText(verifyLine, {
      x: MARGIN,
      y: s.cursor - 9,
      size: 8,
      font: s.body,
      color: MUTED,
    });
    s.cursor -= 10;
  }
}

// ── Layout helpers ────────────────────────────────────────────────────

function drawCentered(
  s: RenderState,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  letterSpacing = 0,
) {
  const width =
    font.widthOfTextAtSize(text, size) + letterSpacing * (text.length - 1);
  const x = MARGIN + (CONTENT_WIDTH - width) / 2;
  if (letterSpacing > 0) {
    let cx = x;
    for (const ch of text) {
      s.page.drawText(ch, { x: cx, y: s.cursor - size, size, font, color });
      cx += font.widthOfTextAtSize(ch, size) + letterSpacing;
    }
  } else {
    s.page.drawText(text, { x, y: s.cursor - size, size, font, color });
  }
}

function drawSectionLabel(s: RenderState, label: string) {
  s.page.drawText(label, {
    x: MARGIN,
    y: s.cursor - 8,
    size: 8,
    font: s.bodyBold,
    color: GOLD,
  });
  s.cursor -= 16;
}

function drawHr(s: RenderState) {
  s.page.drawLine({
    start: { x: MARGIN, y: s.cursor },
    end: { x: PAGE_WIDTH - MARGIN, y: s.cursor },
    thickness: 0.5,
    color: GOLD,
    opacity: 0.5,
  });
}

function ensureSpace(s: RenderState, needed: number) {
  if (s.cursor - needed < MARGIN) {
    s.page = s.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    s.cursor = PAGE_HEIGHT - MARGIN;
  }
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapMonospace(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const charWidth = font.widthOfTextAtSize("0", size);
  const cols = Math.floor(maxWidth / charWidth);
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += cols) {
    lines.push(text.slice(i, i + cols));
  }
  return lines;
}
