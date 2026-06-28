#!/usr/bin/env python3
"""清理 logo 残留白边，但保留平滑抗锯齿边缘（不产生锯齿）。

之前版本用了形态学腐蚀(MinFilter) + 硬阈值，把半透明的抗锯齿边缘啃掉，
导致边缘出现锯齿。本版改为：
1. 从原始备份高分辨率图开始，先放大处理再缩小，进一步柔化边缘(supersampling)。
2. 只做"去白边"颜色反污染(decontaminate)，不动 alpha 的形状。
3. 用极轻的高斯仅羽化 0.4px，去掉最外圈白雾，但不腐蚀，保留抗锯齿过渡。
"""
import numpy as np
from PIL import Image, ImageFilter

SRC = "public/logo_original_backup.png"  # 从未被破坏的原图开始
DST = "public/logo.png"

im = Image.open(SRC).convert("RGBA")

# —— supersample：放大 1.5x 处理，最后高质量缩回，让边缘更顺滑 ——
SS = 1.5
big = im.resize((int(im.width * SS), int(im.height * SS)), Image.LANCZOS)
arr = np.array(big).astype(np.float32)
r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
alpha = a / 255.0

# —— 去白边：反解被白底(~255)污染的前景色 ——
B = 255.0
eps = 1e-3
safe_a = np.clip(alpha, eps, 1.0)
for ch in (0, 1, 2):
    C = arr[..., ch]
    F = (C - (1.0 - alpha) * B) / safe_a
    arr[..., ch] = np.clip(F, 0, 255)

# —— alpha：仅清掉极弱白雾（<6 视为透明），不腐蚀形状，保留抗锯齿 ——
a_new = a.copy()
a_new[a < 6] = 0.0
# 极轻高斯只羽化一点点（0.4px@1.5x ≈ 缩回后 ~0.27px），柔化而非啃边
a_img = Image.fromarray(a_new.astype(np.uint8), mode="L")
a_soft = a_img.filter(ImageFilter.GaussianBlur(0.4))
arr[..., 3] = np.array(a_soft).astype(np.float32)

out_big = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGBA")
# 高质量缩回原始尺寸 —— 缩小过程本身带强抗锯齿，消除锯齿
out = out_big.resize(im.size, Image.LANCZOS)

# 裁掉多余透明边距
bbox = out.getbbox()
if bbox:
    pad = 10
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(out.width, x1 + pad); y1 = min(out.height, y1 + pad)
    out = out.crop((x0, y0, x1, y1))

out.save(DST)
print("saved", DST, out.size)

arr2 = np.array(out)
al = arr2[..., 3]
edge = (al > 10) & (al < 245)
print("soft-edge px (good, means anti-aliased):", int(edge.sum()))
