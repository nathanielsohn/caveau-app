/**
 * PDF renderer for the provenance bundle (feature #40).
 *
 * Uses pdf-lib (pure JS, embedded standard fonts) so it runs unchanged on
 * Vercel serverless without needing a headless browser. The layout is
 * deliberately plain — black on white, single column, paginates as needed.
 * The signed JSON export carries the machine-verifiable record; the PDF is
 * for the human auditor at the auction house or the broker reading on a
 * tablet.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { ProvenanceBundle, ProvenanceEvent } from "./provenance";
import { formatDate, formatHumidity, formatTemp } from "./utils";

const PAGE_WIDTH = 612; // US Letter
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

export async function renderProvenancePdf(
  bundle: ProvenanceBundle,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Caveau Custody & Condition Report — ${bundle.certificateNumber}`);
  doc.setAuthor("Caveau");
  doc.setSubject("Custody & condition chain-of-custody bundle");
  doc.setProducer("Caveau provenance-pdf");
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

  drawHeader(state, bundle);
  drawBottle(state, bundle);
  drawEnvelope(state, bundle);
  drawTimeline(state, bundle);
  drawSignature(state, bundle);

  return doc.save();
}

function drawHeader(s: RenderState, bundle: ProvenanceBundle) {
  drawCentered(s, "CAVEAU", s.serifBold, 22, INK);
  s.cursor -= 4;
  drawCentered(s, "CUSTODY & CONDITION REPORT", s.body, 9, GOLD, 2.5);
  s.cursor -= 18;
  drawHr(s);
  s.cursor -= 18;
  drawCentered(
    s,
    `Report ${bundle.certificateNumber}`,
    s.bodyBold,
    10,
    INK,
  );
  s.cursor -= 14;
  drawCentered(
    s,
    `Generated ${formatDate(bundle.generatedAt)}`,
    s.body,
    9,
    MUTED,
  );
  s.cursor -= 24;
}

function drawBottle(s: RenderState, bundle: ProvenanceBundle) {
  const { bottle, locker, envelope } = bundle;
  drawCentered(s, bottle.name, s.serifBold, 16, INK);
  s.cursor -= 16;
  drawCentered(
    s,
    `${bottle.vintage} · ${bottle.producer} · ${bottle.region}`,
    s.body,
    10,
    INK,
  );
  s.cursor -= 12;
  drawCentered(
    s,
    `Locker #${locker.lockerNumber}, ${locker.zone} Zone`,
    s.body,
    9,
    MUTED,
  );
  s.cursor -= 12;
  drawCentered(
    s,
    `Monitored ${formatDate(envelope.start)} – ${formatDate(envelope.end)}`,
    s.body,
    9,
    MUTED,
  );
  s.cursor -= 24;
}

function drawEnvelope(s: RenderState, bundle: ProvenanceBundle) {
  drawSectionLabel(s, "ENVIRONMENTAL ENVELOPE");
  const e = bundle.envelope;
  const cellW = CONTENT_WIDTH / 3;

  const cells: Array<[string, string, string]> = [
    [
      "Temperature",
      e.temp ? `${formatTemp(e.temp.min)} – ${formatTemp(e.temp.max)}` : "—",
      e.temp ? `avg ${formatTemp(e.temp.avg)}` : "",
    ],
    [
      "Humidity",
      e.humidity
        ? `${formatHumidity(e.humidity.min)} – ${formatHumidity(e.humidity.max)}`
        : "—",
      e.humidity ? `avg ${formatHumidity(e.humidity.avg)}` : "",
    ],
    [
      "Sensor readings",
      e.sampleCount.toLocaleString(),
      `${bundle.events.filter((ev) => ev.kind === "alert").length} alerts`,
    ],
  ];

  const top = s.cursor;
  cells.forEach(([label, range, sub], i) => {
    const x = MARGIN + cellW * i + 4;
    s.page.drawText(label.toUpperCase(), {
      x,
      y: top - 11,
      size: 7,
      font: s.body,
      color: MUTED,
    });
    s.page.drawText(range, {
      x,
      y: top - 26,
      size: 11,
      font: s.bodyBold,
      color: INK,
    });
    if (sub) {
      s.page.drawText(sub, {
        x,
        y: top - 39,
        size: 8,
        font: s.body,
        color: MUTED,
      });
    }
  });
  s.cursor = top - 52;
  drawHr(s);
  s.cursor -= 18;
}

function drawTimeline(s: RenderState, bundle: ProvenanceBundle) {
  drawSectionLabel(s, "TIMELINE");
  for (const event of bundle.events) {
    drawEventRow(s, event);
  }
  s.cursor -= 6;
  drawHr(s);
  s.cursor -= 18;
}

function drawEventRow(s: RenderState, event: ProvenanceEvent) {
  ensureSpace(s, 30);
  const dateStr = formatDate(event.date);
  const dateW = s.body.widthOfTextAtSize(dateStr, 8);
  const dateColX = MARGIN;
  const titleColX = MARGIN + 86;
  const titleColW = CONTENT_WIDTH - 86;

  s.page.drawText(dateStr.toUpperCase(), {
    x: dateColX + (78 - dateW) / 2,
    y: s.cursor - 9,
    size: 7,
    font: s.body,
    color: MUTED,
  });

  s.page.drawText(event.title, {
    x: titleColX,
    y: s.cursor - 9,
    size: 10,
    font: s.bodyBold,
    color: event.severity === "critical" ? rgb(0.76, 0.19, 0.32) : INK,
  });
  s.cursor -= 12;

  if (event.detail) {
    const detailLines = wrap(event.detail, s.body, 9, titleColW);
    for (const line of detailLines) {
      ensureSpace(s, 12);
      s.page.drawText(line, {
        x: titleColX,
        y: s.cursor - 8,
        size: 9,
        font: s.body,
        color: MUTED,
      });
      s.cursor -= 11;
    }
  }
  s.cursor -= 6;
}

function drawSignature(s: RenderState, bundle: ProvenanceBundle) {
  ensureSpace(s, 80);
  drawSectionLabel(s, "BUNDLE SIGNATURE (HMAC-SHA256)");
  const lines = wrapMonospace(bundle.signature, s.mono, 8, CONTENT_WIDTH);
  for (const line of lines) {
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
  s.page.drawText(
    "Verify by re-signing the canonical JSON export with the issuing facility's key.",
    {
      x: MARGIN,
      y: s.cursor - 9,
      size: 8,
      font: s.body,
      color: MUTED,
    },
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────

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
