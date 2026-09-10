"""Rasterize the original geometric CalCamp mark, without external dependencies."""
import math, struct, zlib
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'assets' / 'brand'
def write(size, name, transparent=False):
    pixels = []
    # Supersample edges for crisp launcher assets.
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            samples = []
            for sy in (.25, .75):
                for sx in (.25, .75):
                    xx, yy = (x+sx)*1024/size, (y+sy)*1024/size
                    dx, dy = xx-512, yy-512
                    arc = abs(math.hypot(dx,dy)-250) <= 46 and (dx <= 0 or abs(dy) >= dx)
                    cap = any(math.hypot(xx-689,yy-cy) <= 46 for cy in (335,689))
                    dot = math.hypot(xx-750,yy-512) <= 48
                    samples.append((255,203,120,255) if dot else (169,190,255,255) if arc or cap else (16,17,21,0 if transparent else 255))
            row.extend(round(sum(c[i] for c in samples)/4) for i in range(4))
        pixels.append(row)
    def chunk(t, data): return struct.pack('!I',len(data))+t+data+struct.pack('!I',zlib.crc32(t+data)&0xffffffff)
    (root/name).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b''))
write(1024,'icon.png'); write(512,'mark.png',True); write(64,'favicon.png')
