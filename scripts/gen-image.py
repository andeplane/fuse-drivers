#!/usr/bin/env python3
"""Generate one image with gpt-image-2 and real alpha.
Usage: scripts/gen-image.py OUT.png "PROMPT" [--size 1024x1024] [--quality medium] [--opaque]
Needs OPENAI_API_KEY (source ~/.zshrc). Run with the gpt-image tool's Python or any env with `openai`.
"""
import sys, base64, argparse
from openai import OpenAI
p = argparse.ArgumentParser()
p.add_argument("out"); p.add_argument("prompt")
p.add_argument("--size", default="1024x1024"); p.add_argument("--quality", default="medium")
p.add_argument("--opaque", action="store_true")
a = p.parse_args()
r = OpenAI().images.generate(model="gpt-image-2", prompt=a.prompt, size=a.size, quality=a.quality,
                             background="opaque" if a.opaque else "transparent",
                             output_format="png", moderation="low")
open(a.out, "wb").write(base64.b64decode(r.data[0].b64_json)); print("wrote", a.out)
