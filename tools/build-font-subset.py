#!/usr/bin/env python3
"""构建 PDF 内嵌中文字体子集 → src/font-subset.js（提交产物，一次性生成）。

用法：python3 tools/build-font-subset.py
依赖：fonttools；字体 tools/fonts/NotoSansSC.ttf（OFL 开源，可从 google/fonts 获取）。
"""
import base64
import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "fonts" / "NotoSansSC.ttf"
INST = ROOT / "tools" / "fonts" / "NotoSansSC-w400.ttf"
SUBSET_TTF = ROOT / "tools" / "fonts" / "pdf-subset.ttf"
OUT = ROOT / "src" / "font-subset.js"

# 与 src/pdf.js 中 PDF_TEXT_CHARS 保持一致：侧栏标签 + 数值符号
# 再加 GB2312 一级汉字（3755 常用字）：用户自定义文件名可能含任意常用中文
CHARS = (
    "刀模文件名日期长宽高纸厚说明是否过抛重必须打样确认首次投产前核对注意已超三边和限制比未"
    "单位毫米千克年月日通用开槽纸箱楞图纸内尺寸包装"
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    " .:-/()×≥<>：。，（）！？、；_"
)

def gb2312_level1() -> str:
    chars = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                c = bytes([hi, lo]).decode("gb2312")
                if len(c) == 1:
                    chars.append(c)
            except UnicodeDecodeError:
                pass
    return "".join(chars)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"缺少字体: {SRC}")
    # 变量字体 → 固定 wght=400 实例（大幅缩小体积）
    if not INST.exists():
        font = TTFont(SRC)
        instancer.instantiateVariableFont(font, {"wght": 400}, inplace=True)
        font.save(INST)
    args = [
        str(INST),
        f"--text={CHARS + gb2312_level1()}",
        "--layout-features=",
        "--no-hinting",
        "--desubroutinize",
        f"--output-file={SUBSET_TTF}",
    ]
    subset.main(args)

    font = TTFont(SUBSET_TTF)
    cmap = font.getBestCmap()
    gids: dict[str, int] = {}
    for ch in CHARS + gb2312_level1():
        name = cmap.get(ord(ch))
        if name is None:
            print(f"  (缺字): {ch!r}")
            continue
        gids[ch] = font.getGlyphID(name)
    raw = SUBSET_TTF.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    data = {"base64": b64, "gids": gids, "bytes": len(raw)}
    OUT.write_text("// 由 tools/build-font-subset.py 生成，勿手改。\nexport const PDF_FONT = " + json.dumps(data, ensure_ascii=False) + ";\n", "utf-8")
    print(f"chars={len(gids)} 子集字体={len(raw)//1024}KB base64={len(b64)//1024}KB → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
