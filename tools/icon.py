import zlib, struct, sys
def png(path, N):
    B=(0x00,0x17,0xC1); W=(255,255,255); Y=(0xFF,0xD4,0x3D)
    def rr(x,y,x0,y0,x1,y1,r):
        if x<x0 or x>x1 or y<y0 or y>y1: return False
        cx=min(max(x,x0+r),x1-r); cy=min(max(y,y0+r),y1-r)
        return (x-cx)**2+(y-cy)**2<=r*r
    rows=[]
    for j in range(N):
        row=bytearray([0])
        for i in range(N):
            u,v=i/N,j/N; c=B
            if rr(u,v,.27,.27,.73,.73,.05):
                c=W
                if v<.37: c=Y
                else:
                    for gx in range(3):
                        for gy in range(2):
                            x0=.33+gx*.12; y0=.44+gy*.12
                            if x0<=u<=x0+.08 and y0<=v<=y0+.08: c=B
            row+=bytes(c)
        rows.append(bytes(row))
    raw=zlib.compress(b''.join(rows),9)
    ch=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',N,N,8,2,0,0,0))+ch(b'IDAT',raw)+ch(b'IEND',b''))
for n in (192,512,180): png(f'{sys.argv[1]}/icon-{n}.png',n)
