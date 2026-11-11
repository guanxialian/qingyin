from PIL import Image
import os

SRC = os.path.join(os.path.dirname(__file__), '..', 'assets-src', 'k-on.jpg')
ROOT = os.path.join(os.path.dirname(__file__), '..')

def square(img):
    w, h = img.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return img.crop((left, top, left + s, top + s))

img = Image.open(SRC).convert('RGB')
icon = square(img).resize((1024, 1024), Image.LANCZOS)

appiconset = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
os.makedirs(appiconset, exist_ok=True)
icon.save(os.path.join(appiconset, 'AppIcon-512@2x.png'), 'PNG', optimize=True)

# 启动图：深色底 + 居中图标
bg = (11, 11, 15)
for name, size in [('splash-2732x2732.png', 2732), ('splash-2732x2732-dark.png', 2732)]:
    canvas = Image.new('RGB', (size, size), bg)
    side = int(size * 0.34)
    small = icon.resize((side, side), Image.LANCZOS)
    canvas.paste(small, ((size - side) // 2, (size - side) // 2))
    splash = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')
    os.makedirs(splash, exist_ok=True)
    canvas.save(os.path.join(splash, name), 'PNG', optimize=True)

public = os.path.join(ROOT, 'public')
os.makedirs(public, exist_ok=True)
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(public, 'icon-512.png'), 'PNG', optimize=True)
icon.resize((192, 192), Image.LANCZOS).save(os.path.join(public, 'icon-192.png'), 'PNG', optimize=True)
icon.resize((180, 180), Image.LANCZOS).save(os.path.join(public, 'apple-touch-icon.png'), 'PNG', optimize=True)
print('icon done', icon.size)
