# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from xml.sax.saxutils import escape
from pyrevit import DB

def context_key(doc,view,link):
    return '|'.join((doc.ProjectInformation.UniqueId,view.UniqueId,link.UniqueId))

def parse_offset(text):
    value=float(text.strip().replace(',','.'))
    if not 1<=value<=100:raise ValueError('Informe de 1 a 100 mm na folha.')
    return value

def adjust_specs(specs,wall,link,center,side,endpoint,offset):
    result=[]
    transform=link.GetTotalTransform()
    curve=wall.Location.Curve
    delta=transform.OfPoint(curve.GetEndPoint(1)).Subtract(transform.OfPoint(curve.GetEndPoint(0)))
    for kind,refs,p,q,away,distance in specs:
        if kind=='comprimento':
            if side=='Interior':away=away.Negate()
            elif side=='Automatico' and center and away.DotProduct(p.Add(q).Multiply(.5).Subtract(center))<0:away=away.Negate()
        elif endpoint=='Final':
            p=p.Add(delta);q=q.Add(delta);away=away.Negate()
        result.append((kind,refs,p,q,away,distance))
    return result

def managed_dimensions(doc,records,link,walls):
    by_key={};kept=[]
    wall_ids={w.UniqueId for w in walls}
    for record in records:
        try:dim=doc.GetElement(record.get('dimension',''))
        except Exception:continue
        if not dim:continue
        kept.append(record)
        if record.get('link')!=link.UniqueId or record.get('wall') not in wall_ids:continue
        key=(record['wall'],record['kind'])
        try:valid=dim.IsValidObject and dim.AreReferencesAvailable and dim.Value is not None
        except Exception:valid=False
        by_key.setdefault(key,[]).append((dim,valid))
    return by_key,kept

def preview_html(rows,view,helpers):
    polylines=[];points=[];table=[]
    for row in rows:
        footprint=row['footprint'] or []
        if footprint:
            points.extend(footprint);polylines.append((footprint+footprint[:1],'#687888'))
        kinds=set()
        for kind,refs,p,q,away,offset in row['specs']:
            if kind in kinds:continue
            kinds.add(kind)
            a,b=p.Add(away.Multiply(offset)),q.Add(away.Multiply(offset))
            line=[(v.DotProduct(view.RightDirection),v.DotProduct(view.UpDirection)) for v in (a,b)]
            points.extend(line);polylines.append((line,'#1b73b9' if kind=='comprimento' else '#b67519'))
        table.append('<tr><td>{0}</td><td>{1}</td><td>{2}</td></tr>'.format(row['wall'].Id.Value,escape(', '.join(sorted(kinds)) or 'Sem referencias'),escape('; '.join(row['errors']))))
    drawing=''
    if points:
        x0=min(p[0] for p in points);y0=min(p[1] for p in points);width=max(p[0] for p in points)-x0;height=max(p[1] for p in points)-y0
        scale=540/max(width,height,1)
        paths=['<polyline points="{0}" stroke="{1}" stroke-width="2" fill="none"/>'.format(' '.join('{0:.2f},{1:.2f}'.format(20+(x-x0)*scale,20+(height-(y-y0))*scale) for x,y in line),color) for line,color in polylines]
        drawing='<svg xmlns="http://www.w3.org/2000/svg" width="580" height="580" viewBox="0 0 580 580">'+''.join(paths)+'</svg>'
    return '<h3>Previa geometrica (sem alterar o modelo)</h3><p>Azul: comprimento. Amarelo: espessura. Posicionamento estimado; referencias e colisoes serao validadas ao confirmar.</p>'+drawing+'<table><tr><th>Parede</th><th>Cotas possiveis</th><th>Avisos</th></tr>'+''.join(table)+'</table>'

def locate_wall(uidoc,view,wall,link):
    from System.Collections.Generic import List
    try:
        references=List[DB.Reference]()
        references.Add(DB.Reference(wall).CreateLinkReference(link))
        uidoc.Selection.SetReferences(references)
    except Exception:
        ids=List[DB.ElementId]()
        ids.Add(link.Id)
        uidoc.Selection.SetElementIds(ids)
    box=wall.get_BoundingBox(None)
    if not box:return
    transform=link.GetTotalTransform()
    points=[transform.OfPoint(box.Transform.OfPoint(DB.XYZ(x,y,z))) for x in (box.Min.X,box.Max.X) for y in (box.Min.Y,box.Max.Y) for z in (box.Min.Z,box.Max.Z)]
    center=points[0]
    for point in points[1:]:center=center.Add(point)
    center=center.Multiply(1.0/len(points))
    radius=max(center.DistanceTo(p) for p in points)*1.15+1
    left=center.Subtract(view.RightDirection.Multiply(radius)).Subtract(view.UpDirection.Multiply(radius))
    right=center.Add(view.RightDirection.Multiply(radius)).Add(view.UpDirection.Multiply(radius))
    for window in uidoc.GetOpenUIViews():
        if window.ViewId==view.Id:window.ZoomAndCenterRectangle(left,right);break
