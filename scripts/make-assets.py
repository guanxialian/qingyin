"""生成 App 图标与启动图（不依赖外部素材）"""
import math
import pathlib

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "ios/App/App/Assets.xcassets"

BG_TOP = (11, 11, 15)
BG_BOTTOM = (38, 22, 72)
GLOW = (124, 92, 255)


def base(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BG_TOP)
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        for x in range(size):
            # 左下角柔光
            dx = (x - size * 0.18) / size
            dy = (y - size * 0.95) / size
            glow = max(0.0, 1.0 - math.hypot(dx, dy) * 1.7) ** 2
            px[x, y] = (
                min(255, int(r + GLOW[0] * glow * 0.55)),
                min(255, int(g + GLOW[1] * glow * 0.55)),
                min(255, int(b + GLOW[2] * glow * 0.55)),
            )
    return img


def note(img: Image.Image, cx: float, cy: float, scale: float) -> None:
    """八分音符：两个符头 + 符干 + 符杠"""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = img.size[0]
    head_r = 0.072 * w * scale
    stem_w = 0.028 * w * scale
    stem_h = 0.38 * w * scale
    gap = 0.27 * w * scale

    x1, x2 = cx - gap / 2, cx + gap / 2
    y = cy + stem_h / 2

    for x in (x1, x2):
        d.ellipse(
            [x - head_r * 1.25, y - head_r * 0.95, x + head_r * 1.25, y + head_r * 0.95],
            fill=(255, 255, 255, 240),
        )
    for x in (x2 - head_r * 0.9, x1 - head_r * 0.9):
        d.rectangle([x, y - stem_h - head_r * 0.2, x + stem_w, y], fill=(255, 255, 255, 240))
    d.polygon(
        [
            (x1 - head_r * 0.9, y - stem_h),
            (x2 - head_r * 0.9 + stem_w, y - stem_h),
            (x2 - head_r * 0.9 + stem_w, y - stem_h + stem_w * 3.4),
            (x1 - head_r * 0.9, y - stem_h + stem_w * 3.4),
        ],
        fill=(255, 255, 255, 240),
    )

    glow = layer.filter(ImageFilter.GaussianBlur(radius=max(2, w // 90)))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"), (0, 0))
    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


def make_icon(size: int) -> Image.Image:
    img = base(size)
    note(img, size * 0.5, size * 0.5, 1.15)
    return img


def main() -> None:
    icon = make_icon(1024)
    icon_path = ASSETS / "AppIcon.appiconset/AppIcon-512@2x.png"
    icon.save(icon_path, "PNG")
    print("icon ->", icon_path)

    splash = Image.new("RGB", (2732, 2732), BG_TOP)
    logo = make_icon(900).filter(ImageFilter.GaussianBlur(0.4))
    mask = Image.new("L", logo.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, logo.size[0], logo.size[1]], radius=200, fill=255)
    splash.paste(logo, ((2732 - 900) // 2, (2732 - 900) // 2), mask)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(ASSETS / "Splash.imageset" / name, "PNG")
    print("splash ->", ASSETS / "Splash.imageset")

    # 网页/PWA 用的图标
    public = ROOT / "public"
    public.mkdir(exist_ok=True)
    make_icon(512).save(public / "icon-512.png", "PNG")
    make_icon(192).save(public / "icon-192.png", "PNG")
    print("web icons ->", public)


if __name__ == "__main__":
    main()
