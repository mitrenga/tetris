#!/usr/bin/env python3
"""List and extract files from an RT-11 disk image.

Usage: rt11dir.py IMAGE [--extract DIR]

Reads the RT-11 directory (segments from block 6) and prints name, start
block, length in blocks, creation date and SHA-256 of each permanent file.
With --extract the files are written to DIR.
"""
import hashlib, os, struct, sys

R50 = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ$.%0123456789'

def rad50(w):
    return R50[w // 1600] + R50[(w // 40) % 40] + R50[w % 40]

def rt11date(w):
    if not w:
        return ''
    age = (w >> 14) & 3
    month = (w >> 10) & 15
    day = (w >> 5) & 31
    year = 1972 + (w & 31) + 32 * age
    return f'{year:04d}-{month:02d}-{day:02d}'

def files(img):
    seg = 1
    while seg:
        off = (6 + (seg - 1) * 2) * 512
        total, nxt, high, extra, start = struct.unpack_from('<5H', img, off)
        p = off + 10
        block = start
        while True:
            status, n1, n2, ext, length, job, date = struct.unpack_from('<7H', img, p)
            if status & 0o4000:
                break
            if status & 0o2000:
                yield rad50(n1) + rad50(n2), rad50(ext), block, length, rt11date(date)
            block += length
            p += 14 + extra
        seg = nxt

def main():
    path = sys.argv[1]
    out = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == '--extract' else None
    img = open(path, 'rb').read()
    for name, ext, block, length, date in files(img):
        data = img[block * 512:(block + length) * 512]
        fn = f'{name.strip()}.{ext.strip()}'
        print(f'{fn:12} start {block:6} len {length:5} {date:10} {hashlib.sha256(data).hexdigest()}')
        if out:
            os.makedirs(out, exist_ok=True)
            open(os.path.join(out, fn), 'wb').write(data)

main()
