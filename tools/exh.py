import re, json, sys
t=open(sys.argv[1],encoding='utf-8').read()
lines=[]
for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>',t,re.S):
    txt=''.join(re.findall(r'>([^<]*)</word>',m.group(5)))
    words=re.findall(r'>([^<]*)</word>',m.group(5))
    lines.append((float(m.group(1)),float(m.group(2)),float(m.group(3)),float(m.group(4)),' '.join(words)))
codes=[l for l in lines if re.fullmatch(r'[SFT]-\d+',l[4])]
names=[l for l in lines if not re.fullmatch(r'[SFT]-\d+',l[4])]
res={}
for c in codes:
    cy=(c[1]+c[3])/2
    cand=[n for n in names if 0<n[0]-c[2]<40 and n[1]-8<cy<n[3]+8]
    # multi-line names: collect lines within row
    cand=[n for n in names if 0<n[0]-c[2]<40 and abs((n[1]+n[3])/2-cy)<14]
    cand.sort(key=lambda n:n[1])
    k=c[4][0]+'-'+c[4][2:].zfill(2)
    res[k]=''.join(n[4] for n in cand)
for k in sorted(res): print(k,res[k])
json.dump(res,open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
