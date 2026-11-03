import re, json, sys, math
t=open(sys.argv[1],encoding='utf-8').read()
W=[(float(a),float(b),float(c),float(d),w) for a,b,c,d,w in re.findall(r'xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([^<]*)<',t)]
c=lambda w:((w[0]+w[2])/2,(w[1]+w[3])/2)
res={w[4]:c(w) for w in W if re.fullmatch(r'[SFT]-\d\d',w[4])}
pre=[w for w in W if w[4] in('S-','F-','T-')]
nums=[w for w in W if re.fullmatch(r'\d\d',w[4])]
pairs=sorted((math.dist(c(n),c(p)),i,j) for i,n in enumerate(nums) for j,p in enumerate(pre))
un,up=set(),set()
for d,i,j in pairs:
    if i in un or j in up or d>45: continue
    code=pre[j][4]+nums[i][4]
    if code in res: continue
    un.add(i);up.add(j)
    a,b=c(nums[i]),c(pre[j]); res[code]=((a[0]+b[0])/2,(a[1]+b[1])/2)
print('unused pre',len(pre)-len(up),'unused nums',[nums[i][4] for i in range(len(nums)) if i not in un])
for p,n in (('S',17),('F',48),('T',75)):
    print(p,'missing',[f'{p}-{i:02d}' for i in range(1,n+1) if f'{p}-{i:02d}' not in res])
json.dump({k:[round(v[0],1),round(v[1],1)] for k,v in sorted(res.items())},open(sys.argv[2],'w'))
json.dump([[round(c(pre[j])[0],1),round(c(pre[j])[1],1)] for j in range(len(pre)) if j not in up],open(sys.argv[2]+'.unused.json','w'))
