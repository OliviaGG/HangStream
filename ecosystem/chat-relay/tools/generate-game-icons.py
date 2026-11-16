"""
Generate 8 high-quality 256x256 game icon PNGs for Chat Relay portal.
Uses Pillow for rendering with gradients, shapes, and text.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = r"C:\Chat Relay\public\portal\img"
SIZE = 256
CORNER_RADIUS = 40

# --- Font helpers ---

def load_font(size, bold=True):
    """Load a system font at the given size."""
    paths = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\impact.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def load_impact(size):
    """Load Impact font specifically."""
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\impact.ttf", size)
    except Exception:
        return load_font(size, bold=True)


# --- Drawing helpers ---

def make_gradient(size, color_top, color_bottom, direction="vertical"):
    """Create a gradient image."""
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / (size - 1)
        r = int(color_top[0] + (color_bottom[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bottom[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bottom[2] - color_top[2]) * t)
        a = 255
        if len(color_top) > 3:
            a = int(color_top[3] + (color_bottom[3] - color_top[3]) * t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b, a))
    return img


def make_radial_gradient(size, center, radius, color_center, color_edge):
    """Create a radial gradient overlay (RGBA)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = center
    for y in range(size):
        for x in range(size):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(d / radius, 1.0)
            r = int(color_center[0] + (color_edge[0] - color_center[0]) * t)
            g = int(color_center[1] + (color_edge[1] - color_center[1]) * t)
            b = int(color_center[2] + (color_edge[2] - color_center[2]) * t)
            a = int(color_center[3] + (color_edge[3] - color_center[3]) * t)
            img.putpixel((x, y), (r, g, b, a))
    return img


def apply_rounded_corners(img, radius):
    """Apply rounded corner mask to an image."""
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (img.size[0] - 1, img.size[1] - 1)], radius=radius, fill=255)
    result = img.copy()
    result.putalpha(mask)
    return result


def text_bbox_center(draw, text, font, cx, cy):
    """Get position to center text at (cx, cy)."""
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    return (cx - tw // 2, cy - th // 2)


def draw_hexagon(draw, cx, cy, r, fill=None, outline=None, width=2):
    """Draw a regular hexagon centered at (cx, cy) with radius r."""
    points = []
    for i in range(6):
        angle = math.radians(60 * i - 30)
        px = cx + r * math.cos(angle)
        py = cy + r * math.sin(angle)
        points.append((px, py))
    if fill:
        draw.polygon(points, fill=fill)
    if outline:
        draw.polygon(points, outline=outline)
        # Redraw with thicker lines
        for i in range(6):
            draw.line([points[i], points[(i + 1) % 6]], fill=outline, width=width)


def draw_star(draw, cx, cy, outer_r, inner_r, points_count=5, fill="white"):
    """Draw a star shape."""
    pts = []
    for i in range(points_count * 2):
        r = outer_r if i % 2 == 0 else inner_r
        angle = math.radians(360 / (points_count * 2) * i - 90)
        px = cx + r * math.cos(angle)
        py = cy + r * math.sin(angle)
        pts.append((px, py))
    draw.polygon(pts, fill=fill)


def draw_sparkle(draw, cx, cy, size, fill="white"):
    """Draw a 4-point sparkle/star."""
    draw_star(draw, cx, cy, size, size * 0.3, points_count=4, fill=fill)


# ============================================================
# ICON 1: Spelling Bee
# ============================================================
def create_spelling_bee():
    img = make_gradient(SIZE, (0xFF, 0xB3, 0x00), (0xFF, 0x8F, 0x00))
    draw = ImageDraw.Draw(img)

    # Honeycomb pattern - draw hexagons
    hex_r = 36
    hex_color_fill = (0xE0, 0x9E, 0x00, 200)
    hex_color_outline = (0xCC, 0x8A, 0x00, 255)
    letter_font = load_font(22, bold=True)

    # Hex grid positions (offset coordinates)
    hex_positions = [
        (128, 80),   # top center
        (66, 115),   # mid-left
        (128, 150),  # center
        (190, 115),  # mid-right
        (66, 185),   # bottom-left
        (190, 185),  # bottom-right
        (128, 220),  # bottom center
    ]

    letters_map = {0: "S", 2: "P", 3: "B"}

    for i, (hx, hy) in enumerate(hex_positions):
        fill_c = (0xF0, 0xA0, 0x00, 180) if i not in letters_map else (0xE8, 0x96, 0x00, 220)
        draw_hexagon(draw, hx, hy, hex_r, fill=fill_c, outline=(0xCC, 0x85, 0x00), width=2)
        if i in letters_map:
            letter = letters_map[i]
            pos = text_bbox_center(draw, letter, letter_font, hx, hy)
            draw.text(pos, letter, fill="white", font=letter_font)

    # Draw a stylized bee in upper right area
    bee_cx, bee_cy = 195, 50

    # Bee wings (semi-transparent white ellipses)
    wing_color = (255, 255, 255, 160)
    draw.ellipse([bee_cx - 18, bee_cy - 20, bee_cx - 2, bee_cy - 4], fill=wing_color)
    draw.ellipse([bee_cx + 2, bee_cy - 20, bee_cx + 18, bee_cy - 4], fill=wing_color)

    # Bee body (yellow + black stripes)
    body_top = bee_cy - 2
    body_bot = bee_cy + 18
    draw.ellipse([bee_cx - 10, body_top, bee_cx + 10, body_bot], fill=(0xFF, 0xD5, 0x00))
    # Stripes
    for sy in range(body_top + 4, body_bot - 2, 5):
        draw.rectangle([bee_cx - 8, sy, bee_cx + 8, sy + 2], fill=(0x33, 0x33, 0x33))

    # Bee head
    draw.ellipse([bee_cx - 6, body_top - 6, bee_cx + 6, body_top + 2], fill=(0x33, 0x33, 0x33))

    # Small sparkle decorations
    draw_sparkle(draw, 40, 40, 6, fill=(255, 255, 255, 180))
    draw_sparkle(draw, 220, 230, 5, fill=(255, 255, 255, 150))

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 2: Word 500
# ============================================================
def create_word500():
    img = make_gradient(SIZE, (0x21, 0x96, 0xF3), (0x15, 0x65, 0xC0))
    draw = ImageDraw.Draw(img)

    # Add subtle radial glow from center
    glow = make_radial_gradient(SIZE, (128, 120), 160,
                                (0x42, 0xA5, 0xF5, 60), (0x15, 0x65, 0xC0, 0))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # "500" in large bold text
    font_500 = load_impact(100)
    pos = text_bbox_center(draw, "500", font_500, 128, 110)
    # Shadow
    draw.text((pos[0] + 3, pos[1] + 3), "500", fill=(0, 0, 0, 80), font=font_500)
    draw.text(pos, "500", fill="white", font=font_500)

    # Arrow pointing right under text
    arrow_y = 175
    arrow_cx = 128
    arrow_len = 40
    draw.line([(arrow_cx - arrow_len, arrow_y), (arrow_cx + arrow_len, arrow_y)],
              fill=(255, 255, 255, 220), width=3)
    # Arrowhead
    draw.polygon([
        (arrow_cx + arrow_len, arrow_y),
        (arrow_cx + arrow_len - 12, arrow_y - 8),
        (arrow_cx + arrow_len - 12, arrow_y + 8),
    ], fill=(255, 255, 255, 220))

    # Star/sparkle decorations
    draw_sparkle(draw, 50, 55, 10, fill=(255, 255, 255, 180))
    draw_sparkle(draw, 210, 65, 7, fill=(200, 230, 255, 160))
    draw_sparkle(draw, 45, 200, 6, fill=(200, 230, 255, 140))
    draw_sparkle(draw, 220, 195, 8, fill=(255, 255, 255, 150))
    draw_sparkle(draw, 170, 45, 5, fill=(255, 255, 255, 120))

    # Small dots
    for dx, dy, sz in [(30, 130, 3), (230, 140, 2), (85, 40, 2), (195, 220, 3)]:
        draw.ellipse([dx - sz, dy - sz, dx + sz, dy + sz], fill=(255, 255, 255, 100))

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 3: Wordle
# ============================================================
def create_wordle():
    img = Image.new("RGBA", (SIZE, SIZE), (0x12, 0x12, 0x13, 255))
    draw = ImageDraw.Draw(img)

    green = (0x6A, 0xAA, 0x64)
    yellow = (0xC9, 0xB4, 0x58)
    gray = (0x3A, 0x3A, 0x3C)
    dark_gray = (0x2A, 0x2A, 0x2C)

    tile_size = 36
    gap = 5
    grid_w = 5 * tile_size + 4 * gap
    grid_h = 3 * tile_size + 2 * gap
    start_x = (SIZE - grid_w) // 2
    start_y = (SIZE - grid_h) // 2

    font_tile = load_font(22, bold=True)

    rows = [
        [("W", green), ("O", green), ("R", green), ("D", green), ("L", green)],
        [("E", yellow), ("A", gray), ("R", yellow), ("T", gray), ("H", yellow)],
        [("S", gray), ("L", gray), ("I", dark_gray), ("N", gray), ("K", dark_gray)],
    ]

    for row_i, row in enumerate(rows):
        for col_i, (letter, color) in enumerate(row):
            x = start_x + col_i * (tile_size + gap)
            y = start_y + row_i * (tile_size + gap)
            draw.rounded_rectangle([(x, y), (x + tile_size, y + tile_size)],
                                   radius=4, fill=color)
            pos = text_bbox_center(draw, letter, font_tile,
                                   x + tile_size // 2, y + tile_size // 2)
            draw.text(pos, letter, fill="white", font=font_tile)

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 4: Betweenly
# ============================================================
def create_betweenly():
    img = make_gradient(SIZE, (0x1A, 0x1A, 0x4E), (0x2D, 0x2D, 0x7C))
    draw = ImageDraw.Draw(img)

    # Add a subtle radial glow
    glow = make_radial_gradient(SIZE, (128, 128), 150,
                                (0x3D, 0x3D, 0x8C, 40), (0x1A, 0x1A, 0x4E, 0))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    word_font = load_font(28, bold=True)
    q_font = load_font(42, bold=True)
    small_font = load_font(14, bold=False)

    # "APPLE" near top
    pos_apple = text_bbox_center(draw, "APPLE", word_font, 128, 62)
    draw.text(pos_apple, "APPLE", fill="white", font=word_font)

    # Subtle box around APPLE
    bbox_a = draw.textbbox(pos_apple, "APPLE", font=word_font)
    draw.rounded_rectangle(
        [(bbox_a[0] - 8, bbox_a[1] - 5), (bbox_a[2] + 8, bbox_a[3] + 5)],
        radius=6, outline=(255, 255, 255, 60), width=1
    )

    # "CAT" near bottom
    pos_cat = text_bbox_center(draw, "CAT", word_font, 128, 198)
    draw.text(pos_cat, "CAT", fill="white", font=word_font)

    bbox_c = draw.textbbox(pos_cat, "CAT", font=word_font)
    draw.rounded_rectangle(
        [(bbox_c[0] - 8, bbox_c[1] - 5), (bbox_c[2] + 8, bbox_c[3] + 5)],
        radius=6, outline=(255, 255, 255, 60), width=1
    )

    # Dotted line connecting them
    dot_x = 128
    for y in range(90, 170, 8):
        draw.ellipse([dot_x - 2, y, dot_x + 2, y + 3], fill=(180, 180, 255, 100))

    # Question mark in a circle
    q_bg_color = (0x7C, 0x4D, 0xFF, 180)
    q_cx, q_cy = 128, 130
    q_r = 24
    draw.ellipse([q_cx - q_r, q_cy - q_r, q_cx + q_r, q_cy + q_r], fill=q_bg_color)
    pos_q = text_bbox_center(draw, "?", q_font, q_cx, q_cy - 2)
    draw.text(pos_q, "?", fill="white", font=q_font)

    # Small decorative arrows
    # Up arrow near APPLE
    draw.polygon([(108, 85), (118, 85), (113, 78)], fill=(255, 255, 255, 80))
    # Down arrow near CAT
    draw.polygon([(138, 175), (148, 175), (143, 182)], fill=(255, 255, 255, 80))

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 5: PixeLetters
# ============================================================
def create_pixeletters():
    img = Image.new("RGBA", (SIZE, SIZE), (0x1A, 0x1A, 0x2E, 255))
    draw = ImageDraw.Draw(img)

    # Subtle grid lines
    pixel_size = 18
    grid_offset_x = (SIZE % pixel_size) // 2
    grid_offset_y = (SIZE % pixel_size) // 2
    for x in range(grid_offset_x, SIZE, pixel_size):
        draw.line([(x, 0), (x, SIZE)], fill=(255, 255, 255, 15), width=1)
    for y in range(grid_offset_y, SIZE, pixel_size):
        draw.line([(0, y), (SIZE, y)], fill=(255, 255, 255, 15), width=1)

    # Scattered colorful pixel blocks
    colors = [
        (0xFF, 0x6B, 0x9D),  # pink
        (0x00, 0xD2, 0xFF),  # cyan
        (0xFF, 0xE6, 0x6D),  # yellow
        (0xC0, 0x6C, 0xFF),  # purple
        (0x4E, 0xFF, 0x91),  # green
    ]

    scatter_positions = [
        (1, 2), (2, 1), (12, 3), (11, 1), (0, 10), (13, 9),
        (1, 12), (3, 13), (12, 12), (10, 13), (13, 5), (0, 6),
        (7, 0), (6, 13), (13, 0), (0, 0), (0, 13), (13, 13),
    ]

    import random
    random.seed(42)  # Deterministic

    for gx, gy in scatter_positions:
        c = colors[random.randint(0, len(colors) - 1)]
        alpha = random.randint(60, 140)
        px = grid_offset_x + gx * pixel_size
        py = grid_offset_y + gy * pixel_size
        draw.rectangle(
            [px + 1, py + 1, px + pixel_size - 1, py + pixel_size - 1],
            fill=(*c, alpha)
        )

    # Large letter "P" made of pixel blocks in center
    p_color = (0xFF, 0x6B, 0x9D, 240)
    # P shape on a pixel grid (relative positions)
    p_pixels = [
        # Vertical bar
        (0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (0, 5),
        # Top horizontal
        (1, 0), (2, 0), (3, 0),
        # Right side of bump
        (4, 1), (4, 2),
        # Bottom of bump
        (1, 3), (2, 3), (3, 3),
    ]

    p_start_gx = 4
    p_start_gy = 3

    for dx, dy in p_pixels:
        gx = p_start_gx + dx
        gy = p_start_gy + dy
        px = grid_offset_x + gx * pixel_size
        py = grid_offset_y + gy * pixel_size
        draw.rectangle(
            [px + 1, py + 1, px + pixel_size - 1, py + pixel_size - 1],
            fill=p_color
        )

    # Add a subtle glow behind the P
    glow = make_radial_gradient(SIZE, (128, 140), 90,
                                (0xFF, 0x6B, 0x9D, 30), (0, 0, 0, 0))
    img = Image.alpha_composite(img, glow)

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 6: Searchle
# ============================================================
def create_searchle():
    img = Image.new("RGBA", (SIZE, SIZE), (0x0D, 0x0D, 0x2B, 255))
    draw = ImageDraw.Draw(img)

    # Subtle radial glow
    glow = make_radial_gradient(SIZE, (128, 128), 140,
                                (0x1A, 0x1A, 0x50, 60), (0x0D, 0x0D, 0x2B, 0))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Letters in a circular pattern
    letters = "SEARCH"
    letter_colors = [
        (0x00, 0xE5, 0xFF),  # cyan
        (0xFF, 0x00, 0xFF),  # magenta
        (0x4E, 0xFF, 0x91),  # green
        (0xFF, 0xE6, 0x6D),  # yellow
        (0xFF, 0xA5, 0x00),  # orange
        (0x00, 0xE5, 0xFF),  # cyan
    ]

    font_letter = load_font(32, bold=True)
    center_x, center_y = 128, 125
    radius_letters = 65

    for i, letter in enumerate(letters):
        angle = math.radians(360 / len(letters) * i - 90)
        lx = center_x + radius_letters * math.cos(angle)
        ly = center_y + radius_letters * math.sin(angle)
        color = letter_colors[i]

        # Glow behind letter
        glow_r = 18
        draw.ellipse([lx - glow_r, ly - glow_r, lx + glow_r, ly + glow_r],
                     fill=(*color, 30))

        pos = text_bbox_center(draw, letter, font_letter, lx, ly)
        # Shadow
        draw.text((pos[0] + 1, pos[1] + 1), letter, fill=(0, 0, 0, 100), font=font_letter)
        draw.text(pos, letter, fill=(*color, 240), font=font_letter)

    # Magnifying glass outline
    glass_cx, glass_cy = 128, 122
    glass_r = 42
    draw.ellipse(
        [glass_cx - glass_r, glass_cy - glass_r, glass_cx + glass_r, glass_cy + glass_r],
        outline=(255, 255, 255, 50), width=3
    )
    # Handle
    handle_angle = math.radians(45)
    hx1 = glass_cx + glass_r * math.cos(handle_angle)
    hy1 = glass_cy + glass_r * math.sin(handle_angle)
    hx2 = hx1 + 30 * math.cos(handle_angle)
    hy2 = hy1 + 30 * math.sin(handle_angle)
    draw.line([(hx1, hy1), (hx2, hy2)], fill=(255, 255, 255, 60), width=5)
    # Handle end cap
    draw.ellipse([hx2 - 4, hy2 - 4, hx2 + 4, hy2 + 4], fill=(255, 255, 255, 60))

    # Small floating letters around edges
    small_font = load_font(14, bold=False)
    extras = [("L", 40, 45, (0xFF, 0x6B, 0x9D, 80)),
              ("E", 210, 55, (0x4E, 0xFF, 0x91, 80)),
              ("W", 35, 200, (0xFF, 0xE6, 0x6D, 70)),
              ("D", 215, 195, (0x00, 0xE5, 0xFF, 70))]
    for letter, lx, ly, color in extras:
        pos = text_bbox_center(draw, letter, small_font, lx, ly)
        draw.text(pos, letter, fill=color, font=small_font)

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 7: Figural
# ============================================================
def create_figural():
    img = make_gradient(SIZE, (0x00, 0x4D, 0x40), (0x00, 0x69, 0x5C))
    draw = ImageDraw.Draw(img)

    # Subtle radial glow
    glow = make_radial_gradient(SIZE, (128, 128), 130,
                                (0x00, 0x90, 0x80, 40), (0x00, 0x4D, 0x40, 0))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Large diamond/rhombus in center
    diamond_cx, diamond_cy = 128, 128
    diamond_w, diamond_h = 60, 80
    diamond_color = (0x00, 0xE5, 0xFF)

    diamond_points = [
        (diamond_cx, diamond_cy - diamond_h),       # top
        (diamond_cx + diamond_w, diamond_cy),        # right
        (diamond_cx, diamond_cy + diamond_h),        # bottom
        (diamond_cx - diamond_w, diamond_cy),        # left
    ]
    draw.polygon(diamond_points, fill=(*diamond_color, 200))
    draw.polygon(diamond_points, outline=(*diamond_color, 255))

    # Inner highlight on diamond (smaller diamond, lighter)
    inner_w, inner_h = 30, 40
    inner_points = [
        (diamond_cx, diamond_cy - inner_h),
        (diamond_cx + inner_w, diamond_cy),
        (diamond_cx, diamond_cy + inner_h),
        (diamond_cx - inner_w, diamond_cy),
    ]
    draw.polygon(inner_points, fill=(0x00, 0xE5, 0xFF, 60))

    # Small geometric shapes floating around
    shape_color = (0x00, 0xE5, 0xFF, 120)
    light_color = (0x80, 0xFF, 0xFF, 100)

    # Triangle (upper left)
    tri_cx, tri_cy = 50, 55
    tri_r = 16
    tri_pts = []
    for i in range(3):
        angle = math.radians(120 * i - 90)
        tri_pts.append((tri_cx + tri_r * math.cos(angle), tri_cy + tri_r * math.sin(angle)))
    draw.polygon(tri_pts, fill=shape_color)

    # Circle (upper right)
    circ_cx, circ_cy = 205, 60
    circ_r = 12
    draw.ellipse([circ_cx - circ_r, circ_cy - circ_r, circ_cx + circ_r, circ_cy + circ_r],
                 fill=light_color)

    # Square (lower left)
    sq_cx, sq_cy = 55, 200
    sq_r = 11
    draw.rectangle([sq_cx - sq_r, sq_cy - sq_r, sq_cx + sq_r, sq_cy + sq_r],
                   fill=shape_color)

    # Small diamond (lower right)
    sm_cx, sm_cy = 200, 195
    sm_r = 10
    draw.polygon([
        (sm_cx, sm_cy - sm_r), (sm_cx + sm_r, sm_cy),
        (sm_cx, sm_cy + sm_r), (sm_cx - sm_r, sm_cy)
    ], fill=light_color)

    # Pentagon (mid-left)
    pent_cx, pent_cy = 40, 130
    pent_r = 9
    pent_pts = []
    for i in range(5):
        angle = math.radians(72 * i - 90)
        pent_pts.append((pent_cx + pent_r * math.cos(angle), pent_cy + pent_r * math.sin(angle)))
    draw.polygon(pent_pts, fill=(0x00, 0xE5, 0xFF, 80))

    # Hexagon (mid-right)
    hex_cx, hex_cy = 218, 130
    hex_r = 10
    hex_pts = []
    for i in range(6):
        angle = math.radians(60 * i)
        hex_pts.append((hex_cx + hex_r * math.cos(angle), hex_cy + hex_r * math.sin(angle)))
    draw.polygon(hex_pts, fill=(0x80, 0xFF, 0xFF, 80))

    # Small sparkle dots
    for sx, sy in [(90, 35), (175, 35), (85, 225), (180, 225), (128, 30), (128, 228)]:
        draw.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=(0x00, 0xE5, 0xFF, 60))

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# ICON 8: Squaredle
# ============================================================
def create_squaredle():
    img = make_gradient(SIZE, (0x4A, 0x00, 0x00), (0x7B, 0x00, 0x00))
    draw = ImageDraw.Draw(img)

    # Subtle glow
    glow = make_radial_gradient(SIZE, (128, 128), 140,
                                (0x8B, 0x20, 0x20, 40), (0x4A, 0x00, 0x00, 0))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    cell_size = 42
    gap = 6
    grid_total = 4 * cell_size + 3 * gap
    start_x = (SIZE - grid_total) // 2
    start_y = (SIZE - grid_total) // 2

    font_cell = load_font(20, bold=True)

    # Grid colors: bright red for highlighted, dark red for others
    bright_red = (0xE9, 0x45, 0x60)
    dark_red = (0x6B, 0x15, 0x25)
    mid_red = (0x8B, 0x25, 0x35)

    letters_grid = [
        ["W", "O", "R", "D"],
        ["A", "L", "E", "S"],
        ["G", "R", "I", "N"],
        ["T", "H", "A", "T"],
    ]

    # Highlighted cells (path)
    highlighted = {(0, 0), (0, 1), (0, 2), (0, 3), (1, 1), (2, 2), (3, 3)}
    mid_cells = {(1, 0), (1, 3), (2, 0), (3, 0)}

    for row in range(4):
        for col in range(4):
            x = start_x + col * (cell_size + gap)
            y = start_y + row * (cell_size + gap)

            if (row, col) in highlighted:
                color = bright_red
            elif (row, col) in mid_cells:
                color = mid_red
            else:
                color = dark_red

            draw.rounded_rectangle(
                [(x, y), (x + cell_size, y + cell_size)],
                radius=6, fill=color
            )

            # Letter
            letter = letters_grid[row][col]
            text_color = "white" if (row, col) in highlighted else (200, 180, 180)
            pos = text_bbox_center(draw, letter, font_cell,
                                   x + cell_size // 2, y + cell_size // 2)
            draw.text(pos, letter, fill=text_color, font=font_cell)

    # Draw connecting path line between highlighted cells
    path_order = [(0, 0), (0, 1), (0, 2), (0, 3), (1, 1), (2, 2), (3, 3)]
    path_color = (0xFF, 0xDD, 0x57, 180)

    for i in range(len(path_order) - 1):
        r1, c1 = path_order[i]
        r2, c2 = path_order[i + 1]
        x1 = start_x + c1 * (cell_size + gap) + cell_size // 2
        y1 = start_y + r1 * (cell_size + gap) + cell_size // 2
        x2 = start_x + c2 * (cell_size + gap) + cell_size // 2
        y2 = start_y + r2 * (cell_size + gap) + cell_size // 2
        draw.line([(x1, y1), (x2, y2)], fill=path_color, width=3)

    # Small dots at path nodes
    for r, c in path_order:
        cx = start_x + c * (cell_size + gap) + cell_size // 2
        cy = start_y + r * (cell_size + gap) + cell_size // 2
        draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(0xFF, 0xDD, 0x57, 200))

    return apply_rounded_corners(img, CORNER_RADIUS)


# ============================================================
# Main - Generate all icons
# ============================================================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    icons = {
        "game-spellingbee.png": create_spelling_bee,
        "game-word500.png": create_word500,
        "game-wordle.png": create_wordle,
        "game-betweenly.png": create_betweenly,
        "game-pixeletters.png": create_pixeletters,
        "game-searchle.png": create_searchle,
        "game-figural.png": create_figural,
        "game-squaredle.png": create_squaredle,
    }

    for filename, creator in icons.items():
        print(f"Generating {filename}...")
        img = creator()
        path = os.path.join(OUTPUT_DIR, filename)
        img.save(path, "PNG", optimize=True)
        size_kb = os.path.getsize(path) / 1024
        print(f"  Saved: {path} ({size_kb:.1f} KB)")

    print(f"\nDone! Generated {len(icons)} icons in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
