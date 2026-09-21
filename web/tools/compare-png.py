#!/usr/bin/env python3
"""Compares the web chart with the Android chart, pixel by pixel, over the ring only (the center text is another matter).

  python3 tools/compare-png.py <web.png> <android.png> [diff.png]

Both images are 756 x 756: the web one is the SVG from `node tools/svg-of.ts <scenario> out.svg` rendered to a PNG
(on macOS: `qlmanage -t -s 756 -o . out.svg`), the Android one is the demo's chart view cropped from an emulator
screenshot. It prints the mean error (out of 255) and how many ring pixels are off by more than 32 and 96, and writes
a map of the differences (darker is worse, four times amplified).
"""
import sys, zlib, struct, math
def load(path):
    d=open(path,'rb').read(); pos=8; idat=b''; w=h=0
    while pos<len(d):
        ln,=struct.unpack('>I',d[pos:pos+4]); typ=d[pos+4:pos+8]; body=d[pos+8:pos+8+ln]; pos+=12+ln
        if typ==b'IHDR': w,h,bd,ct,_,_,il=struct.unpack('>IIBBBBB',body); assert bd==8 and il==0,(bd,il)
        elif typ==b'IDAT': idat+=body
    bpp={2:3,6:4}[ct]; raw=zlib.decompress(idat); stride=w*bpp; rows=[]; prev=bytearray(stride); p=0
    for y in range(h):
        f=raw[p]; line=bytearray(raw[p+1:p+1+stride]); p+=1+stride
        for i in range(stride):
            a=line[i-bpp] if i>=bpp else 0; b=prev[i]; c=prev[i-bpp] if i>=bpp else 0
            if f==1: line[i]=(line[i]+a)&255
            elif f==2: line[i]=(line[i]+b)&255
            elif f==3: line[i]=(line[i]+((a+b)>>1))&255
            elif f==4:
                pa=abs(b-c); pb=abs(a-c); pc=abs(a+b-2*c); pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                line[i]=(line[i]+pr)&255
        rows.append(line); prev=line
    return w,h,bpp,rows
def rgb(img):  # over white
    w,h,bpp,rows=img; out=[]
    for y in range(h):
        r=rows[y]; row=[]
        for x in range(w):
            R,G,B=r[x*bpp],r[x*bpp+1],r[x*bpp+2]
            if bpp==4:
                a=r[x*bpp+3]/255; R=round(R*a+255*(1-a)); G=round(G*a+255*(1-a)); B=round(B*a+255*(1-a))
            row.append((R,G,B))
        out.append(row)
    return out
def write_png(path,pix):
    h=len(pix); w=len(pix[0]); raw=b''.join(b'\x00'+bytes(c for px in row for c in px) for row in pix)
    def chunk(t,d): c=struct.pack('>I',len(d))+t+d; return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))

web_path, android_path = sys.argv[1], sys.argv[2]
diff_path = sys.argv[3] if len(sys.argv) > 3 else web_path.rsplit(".", 1)[0] + ".diff.png"
web = rgb(load(web_path)); andr = rgb(load(android_path))
size = len(web)
cx = cy = size / 2
lo, hi = size * 0.3413, size * 0.4497   # the ring and its shadow, at the demo's proportions (258 and 340 of 756)
n = total = big = huge = 0
diffimg = []
for y in range(size):
    row = []
    for x in range(size):
        if lo <= math.hypot(x - cx, y - cy) <= hi:
            e = max(abs(a - b) for a, b in zip(web[y][x], andr[y][x]))
            n += 1; total += e; big += e > 32; huge += e > 96
            v = min(255, e * 4); row.append((255 - v, 255 - v, 255 - v))
        else:
            row.append((255, 255, 255))
    diffimg.append(row)
write_png(diff_path, diffimg)
print(f"ring pixels {n}: mean error {total / n:5.2f}/255, off by more than 32: {100 * big / n:5.2f}%, more than 96: {100 * huge / n:5.2f}%")
print(f"difference map: {diff_path}")
