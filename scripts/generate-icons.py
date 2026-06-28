#!/usr/bin/env python3
"""Generate PWA icons: 192, 384, 512 PNG + maskable variants."""

from PIL import Image, ImageDraw
import os

ACCENT = (0, 228, 192)  # #00E4C0
BG = (26, 15, 10)       # #1A0F0A

def draw_mancala_glyph(draw, size, padding_ratio=0.18):
    pad = int(size * padding_ratio)
    inner = size - 2 * pad
    # Layout
    pit_r = inner * 0.08
    store_w = inner * 0.15
    store_h = inner * 0.5
    gap = (inner - 2 * store_w - 6 * 2 * pit_r) / 7

    cx = size / 2
    cy = size / 2
    left_x = cx - inner / 2
    top_row_y = cy - store_h / 2 - gap / 2 - pit_r
    bot_row_y = cy + store_h / 2 + gap / 2 + pit_r

    # Left store
    lx = left_x
    ly = cy - store_h / 2
    draw.rounded_rectangle(
        [lx, ly, lx + store_w, ly + store_h],
        radius=int(pit_r),
        fill=ACCENT,
    )

    # Right store
    rx = cx + inner / 2 - store_w
    draw.rounded_rectangle(
        [rx, ly, rx + store_w, ly + store_h],
        radius=int(pit_r),
        fill=ACCENT,
    )

    # Pits - top and bottom rows
    pit_start_x = left_x + store_w + gap
    for row in range(2):
        y = top_row_y if row == 0 else bot_row_y
        for i in range(6):
            x = pit_start_x + i * (2 * pit_r + gap) + pit_r
            draw.ellipse(
                [x - pit_r, y - pit_r, x + pit_r, y + pit_r],
                fill=ACCENT,
            )

def generate(size, out_path, with_padding=True):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad_ratio = 0.22 if with_padding else 0.18
    draw_mancala_glyph(draw, size, pad_ratio)
    img.save(out_path, "PNG")
    print(f"  Created {out_path} ({size}x{size})")

def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out_dir, exist_ok=True)

    sizes = [192, 384, 512]
    for s in sizes:
        # Regular icon
        generate(s, os.path.join(out_dir, f"icon-{s}.png"), with_padding=True)
        # Maskable icon (same design, slightly more padding)
        generate(s, os.path.join(out_dir, f"icon-{s}-maskable.png"), with_padding=True)

    print("\nDone! Icons generated in public/icons/")

if __name__ == "__main__":
    main()
