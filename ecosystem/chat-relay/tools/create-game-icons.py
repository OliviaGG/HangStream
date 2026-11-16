from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import math, random

def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return mask

def make_gradient(img, top_color, bottom_color):
    w, h = img.size
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        r = int(top_color[0] + (bottom_color[0] - top_color[0]) * t)
        g = int(top_color[1] + (bottom_color[1] - top_color[1]) * t)
        b = int(top_color[2] + (bottom_color[2] - top_color[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b, 255)

def get_font(size, bold=True):
    if bold:
        paths = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]
    else:
        paths = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeuib.ttf"]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

SIZE = 256
RADIUS = 40

def create_figural():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    make_gradient(bg, (10, 22, 40), (26, 42, 74))
    mask = rounded_mask((SIZE, SIZE), RADIUS)
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)
    cx, cy = SIZE // 2, SIZE // 2 - 18
    diamond_r = 52
    diamond_points = [(cx, cy - diamond_r), (cx + diamond_r, cy), (cx, cy + diamond_r), (cx - diamond_r, cy)]
    glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for blur_r, alpha in [(25, 30), (18, 45), (12, 60), (6, 80)]:
        g = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        gd.polygon(diamond_points, fill=(0, 229, 255, alpha))
        g = g.filter(ImageFilter.GaussianBlur(blur_r))
        glow_layer = Image.alpha_composite(glow_layer, g)
    glow_alpha = glow_layer.split()[3]
    glow_masked_alpha = ImageChops.multiply(glow_alpha, mask)
    glow_layer.putalpha(glow_masked_alpha)
    img = Image.alpha_composite(img, glow_layer)
    draw = ImageDraw.Draw(img)
    draw.polygon(diamond_points, fill=(0, 229, 255, 255))
    highlight_points = [(cx, cy - diamond_r), (int(cx + diamond_r * 0.5), int(cy - diamond_r * 0.25)), (cx, cy), (int(cx - diamond_r * 0.5), int(cy - diamond_r * 0.25))]
    draw.polygon(highlight_points, fill=(100, 240, 255, 100))
    draw.line([diamond_points[3], diamond_points[0]], fill=(200, 255, 255, 160), width=2)
    draw.line([diamond_points[0], diamond_points[1]], fill=(150, 240, 255, 100), width=1)
    font_title = get_font(24, bold=True)
    text = "FIGURAL"
    bbox = draw.textbbox((0, 0), text, font=font_title)
    tw = bbox[2] - bbox[0]
    text_x = (SIZE - tw) // 2
    text_y = cy + diamond_r + 18
    draw.text((text_x + 1, text_y + 1), text, fill=(0, 0, 0, 120), font=font_title)
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 240), font=font_title)
    r, g_ch, b, a = img.split()
    a = ImageChops.multiply(a, mask)
    img.putalpha(a)
    out_path = "C:/Chat Relay/public/portal/img/game-figural.png"
    img.save(out_path)
    print(f"Figural icon saved: {out_path}")

def create_squaredle():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    make_gradient(bg, (26, 10, 26), (45, 16, 64))
    mask = rounded_mask((SIZE, SIZE), RADIUS)
    bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)
    grid_size = 4
    cell_size = 34
    gap = 4
    grid_total = grid_size * cell_size + (grid_size - 1) * gap
    grid_x0 = (SIZE - grid_total) // 2
    grid_y0 = (SIZE - grid_total) // 2 - 16
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle([grid_x0 - 15, grid_y0 - 15, grid_x0 + grid_total + 15, grid_y0 + grid_total + 15], radius=20, fill=(233, 69, 96, 35))
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    glow_alpha = glow.split()[3]
    glow_masked = ImageChops.multiply(glow_alpha, mask)
    glow.putalpha(glow_masked)
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)
    colors = [(233, 69, 96), (255, 107, 157), (79, 195, 79)]
    random.seed(42)
    letters = "SQUAREDLWOGNIHTM"
    font_letter = get_font(20, bold=True)
    idx = 0
    for row in range(grid_size):
        for col in range(grid_size):
            x = grid_x0 + col * (cell_size + gap)
            y = grid_y0 + row * (cell_size + gap)
            if (row + col) % 3 == 0:
                color = colors[0]
            elif (row + col) % 3 == 1:
                color = colors[1]
            else:
                color = colors[2]
            draw.rounded_rectangle([x, y, x + cell_size, y + cell_size], radius=6, fill=(*color, 230))
            draw.rounded_rectangle([x + 2, y + 2, x + cell_size - 2, y + cell_size // 2], radius=4, fill=(255, 255, 255, 35))
            letter = letters[idx % len(letters)]
            idx += 1
            lb = draw.textbbox((0, 0), letter, font=font_letter)
            lw = lb[2] - lb[0]
            lh = lb[3] - lb[1]
            lx = x + (cell_size - lw) // 2
            ly = y + (cell_size - lh) // 2 - 2
            draw.text((lx + 1, ly + 1), letter, fill=(0, 0, 0, 80), font=font_letter)
            draw.text((lx, ly), letter, fill=(255, 255, 255, 240), font=font_letter)
    font_title = get_font(22, bold=True)
    text = "SQUAREDLE"
    bbox = draw.textbbox((0, 0), text, font=font_title)
    tw = bbox[2] - bbox[0]
    text_x = (SIZE - tw) // 2
    text_y = grid_y0 + grid_total + 14
    draw.text((text_x + 1, text_y + 1), text, fill=(0, 0, 0, 120), font=font_title)
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 240), font=font_title)
    r, g_ch, b, a = img.split()
    a = ImageChops.multiply(a, mask)
    img.putalpha(a)
    out_path = "C:/Chat Relay/public/portal/img/game-squaredle.png"
    img.save(out_path)
    print(f"Squaredle icon saved: {out_path}")

if __name__ == "__main__":
    create_figural()
    create_squaredle()
    print("Done!")
