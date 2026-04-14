# Design System

> Last updated: 2026-04-13 | 14 core + 3 stretch features complete; 15 of 24 roadmap features done

## Brand

- **Name:** Caveau
- **Logo:** ◈ (diamond character)
- **Aesthetic:** Dark luxury, glass-morphism, gold accents

## Colors

All colors are defined in `tailwind.config.ts`.

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `caveau-black` | `#0A0A0B` | Page background, root `<body>` |
| `caveau-charcoal` | `#141416` | Card backgrounds (at 80% opacity) |
| `caveau-graphite` | `#1C1C20` | Elevated surfaces, image placeholders |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `slate` | `#2A2A30` | Card borders (at 50% opacity), dividers |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#E8E6E1` | Body text, headings |
| `secondary` | `#9B9A97` | Labels, metadata |
| `muted` | `#8B8B96` | Disabled, placeholder (lightened from `#6B6B76` for WCAG AA contrast) |

### Accents
| Token | Hex | Usage |
|-------|-----|-------|
| `gold` | `#FFD166` | Primary buttons, highlights, chart fills |
| `gold-text` | `#D4A034` | Gold text, button hover state |
| `burgundy` | `#C23152` | Wine-related elements, varietal badges |

### Status
| Token | Hex | Usage |
|-------|-----|-------|
| `ok` | `#34D399` | Normal conditions, success |
| `warn` | `#FBBF24` | Warnings, threshold approaching |
| `danger` | `#F87171` | Critical alerts, threshold breached |
| `info` | `#60A5FA` | Informational badges |

## Typography

### Fonts
- **Playfair Display** (serif) — headings, wine names, certificate titles
  - CSS variable: `--font-playfair`
  - Tailwind class: `font-serif`
- **Inter** (sans-serif) — body text, labels, data values
  - CSS variable: `--font-inter`
  - Tailwind class: `font-sans` (default)

Both are loaded via `next/font/google` with `display: "swap"` for performance.

### Scale
- Page titles: `text-2xl font-serif font-bold` or `text-3xl`
- Section headers: `text-lg font-semibold`
- Body: `text-sm` (default)
- Labels/metadata: `text-xs text-secondary`
- Data values: `text-2xl font-semibold` (metric cards)

## Components

### Glass Card
The signature Caveau card style. Use everywhere.

```html
<div class="glass-card p-6">
  <!-- content -->
</div>
```

Expands to: `bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl`

### Buttons

**Gold (primary action):**
```html
<button class="btn-gold">Add Wine</button>
```

**Ghost (secondary action):**
```html
<button class="btn-ghost">Cancel</button>
```

### Status Badges
```html
<span class="badge-ok">Optimal</span>
<span class="badge-warn">Warning</span>
<span class="badge-danger">Critical</span>
<span class="badge-info">Info</span>
```

## Layout Rules

- **Dark theme always.** No light mode, no toggle.
- **Mobile-first.** All layouts must work at 375px width.
- **Desktop sidebar** — fixed left nav with logo, 4 links, member name.
- **Mobile bottom tabs** — 4-icon tab bar replacing the sidebar.
- **Content area** — scrollable, padded `p-6` (desktop) / `p-4` (mobile).
- **Card grid** — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`

## Image Fallback

When `Wine.imageUrl` is null, display a placeholder:
- Centered Lucide `Wine` icon
- Dark background: `bg-caveau-graphite`
- Muted label: "No image"

Apply consistently on wine cards, wine detail page, and anywhere wine images appear.
