import json, html, sys
d=sys.argv[1]
S=json.load(open(d+'/sessions.json',encoding='utf-8'))
S=[s for s in S if s['date'] in('2026-11-12','2026-11-13') and not s['id'].startswith('cd2026exh') and '予備' not in s['title']]
for s in S: s.pop('cats',None) if False else None
pos=json.load(open(d+'/booth_pos.json'))
fix={'T-22':[1214.2,512.6],'T-23':[1203.9,522.9],'T-25':[1179.0,548.1],'T-26':[1168.7,558.4],'T-27':[1112.5,571.6],'T-28':[1143.4,583.7],'T-29':[1133.1,594.0],'T-36':[1108.0,619.1],'T-32':[1189.2,681.6],'T-33':[1199.6,691.9],'T-34':[1224.3,716.7],'T-08':[1431.7,524.5],'T-09':[1420.8,535.0],'T-66':[810.4,524.4],'T-68':[775.4,559.4],'T-48':[999.7,524.9],'T-50':[984.5,564.3],'T-56':[998.5,640.6],'T-60':[927.9,711.3],'T-55':[1055.6,635.2]}
pos.update(fix)
names=json.load(open(d+'/exh.json',encoding='utf-8'))
B=[]
for k in sorted(names, key=lambda k:('SFT'.index(k[0]),int(k[2:]))):
    x,y=pos[k]
    if k[0]=='S': y-=10  # 菱形ブースはラベルより上が中心
    B.append([k,html.unescape(names[k]).strip(),round(x,1),round(y,1)])
P=[["銭湯STAGE","stage",646,254],["書店STAGE","stage",1002,277],["バーガーSTAGE","stage",1164,277],["警察STAGE","stage",1513,254],["大学STAGE","stage",646,726],["病院STAGE","stage",1513,726],
["サイボウズタワー","spot",1081,470],["サイボウズブース","spot",579,396],["JAPAN広場","spot",195,509],["受付","spot",1078,813],["入口","spot",1078,886],["出口","spot",714,886],
["① 抽選所","spot",1078,241],["③ 東口バス停（ミニセミナー）","spot",771,494],["③ 西口バス停（ミニセミナー）","spot",1393,494],["④ クリヤマスライダー","spot",1583,491],["⑤ サイボウズ商店","spot",579,582],["⑥ ビジネスチャンネル配信コーナー（2F）","spot",1076,921],
["⑦ キッチンカー（HALL6）","food",895,150],["⑦ キッチンカー（HALL5）","food",1265,150],["⑧ HADO 道場","spot",1271,846],["⑨ バスケットコーナー","spot",885,847],["⑩ 充電スポット（HALL6）","spot",823,192],["⑩ 充電スポット（HALL5）","spot",1337,192],["喫煙所","spot",458,99]]
out='// Cybozu Days 2026 公式サイト・会場マップ(PDF)から生成したデータ\n'
out+='window.CD26 = '+json.dumps({'sessions':S,'booths':B,'pois':P,'mapSize':[1683.78,1190.55],'days':[{'date':'2026-11-12','label':'DAY1','sub':'11/12（木）'},{'date':'2026-11-13','label':'DAY2','sub':'11/13（金）'}],'sourceUrl':'https://c2026.smktg.jp/public/application/add/803'},ensure_ascii=False,separators=(',',':'))+';\n'
open(sys.argv[2],'w',encoding='utf-8').write(out)
print(len(S),'sessions',len(B),'booths')
