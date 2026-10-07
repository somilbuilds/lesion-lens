from PIL import Image, ImageDraw, ImageFilter
import numpy as np

# 1. Blank/Solid image (fails skin check)
img1 = Image.new('RGB', (400, 400), color=(0, 0, 255))
img1.save('test_blank.jpg')

# 2. Blurry image
img2 = Image.new('RGB', (400, 400), color=(200, 150, 130))
d = ImageDraw.Draw(img2)
d.ellipse([100, 100, 300, 300], fill=(130, 80, 70))
img2 = img2.filter(ImageFilter.GaussianBlur(15))
img2.save('test_blurry.jpg')

# 3. Real-looking skin image (passing)
img3 = Image.new('RGB', (400, 400), color=(210, 160, 140))
d = ImageDraw.Draw(img3)
d.ellipse([120, 120, 280, 280], fill=(100, 50, 40))
# add some noise for texture
img_np = np.array(img3).astype(np.float32)
noise = np.random.normal(0, 5, img_np.shape)
img_np = np.clip(img_np + noise, 0, 255).astype(np.uint8)
img3_final = Image.fromarray(img_np)
img3_final.save('test_skin.jpg')
