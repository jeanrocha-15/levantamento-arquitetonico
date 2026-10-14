# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from pyrevit import DB, forms, revit, script
from Autodesk.Revit.UI.Selection import ObjectType
from Autodesk.Revit.Exceptions import OperationCanceledException

ALIGNMENT = 0.999999

def faces_of(wall, view):
    options = DB.Options()
    options.ComputeReferences = True
    options.IncludeNonVisibleObjects = False
    native_view=getattr(view,'native_view',view)
    if native_view is not None:options.View=native_view
    else:options.DetailLevel=DB.ViewDetailLevel.Fine
    faces = []
    for geometry in wall.get_Geometry(options):
        # Wall solids supply original model references; no copied geometry.
        if isinstance(geometry, DB.Solid):
            for face in geometry.Faces:
                if isinstance(face, DB.PlanarFace) and face.Reference:
                    faces.append(face)
    return faces

def edges_of(wall, view):
    options=DB.Options()
    options.ComputeReferences=True
    options.IncludeNonVisibleObjects=False
    native_view=getattr(view,'native_view',view)
    if native_view is not None:options.View=native_view
    else:options.DetailLevel=DB.ViewDetailLevel.Fine
    edges=[]
    for geometry in wall.get_Geometry(options):
        if isinstance(geometry,DB.Solid):
            edges.extend(list(geometry.Edges))
    return edges

def endpoint_candidates(wall,view,curve,start,end,direction,faces):
    alternatives=[]
    doc=getattr(wall,'Document',revit.doc)
    def valid(ref):
        if ref is None: return False
        try:
            if ref.ElementId != wall.Id: return False
            return bool(ref.ConvertToStableRepresentation(doc))
        except Exception: return False
    try:
        refs=[curve.GetEndPointReference(0),curve.GetEndPointReference(1)]
        if all(valid(r) for r in refs) and reference_key(doc,refs)[0]!=reference_key(doc,refs)[1]:
            alternatives.append((refs,project_to_view(start,view),project_to_view(end,view)))
    except Exception:
        pass
    ends=[[],[]]
    near=max(wall.Width*2,0.01)
    span=end.Subtract(start).DotProduct(direction)
    def add(ref,point):
        if not valid(ref): return
        t=point.Subtract(start).DotProduct(direction)
        for index,target in enumerate((0,span)):
            if abs(t-target)<=near and abs(t-target)<span/2:
                projected=project_to_view(start,view).Add(direction.Multiply(t))
                ends[index].append((abs(t-target),ref,projected))
    for face in faces:
        if abs(face.FaceNormal.DotProduct(direction))>=ALIGNMENT:
            add(face.Reference,face.Origin)
    try:
        edges=edges_of(wall,view)
    except Exception:
        edges=[]
    for edge in edges:
        try:
            c=edge.AsCurve()
            if not isinstance(c,DB.Line): continue
            a,b=c.GetEndPoint(0),c.GetEndPoint(1)
            axis=b.Subtract(a).Normalize()
            # Original vertical edge: a stable point reference in a plan view.
            if abs(axis.DotProduct(view.ViewDirection))>=ALIGNMENT:
                add(edge.Reference,a)
            # Original edge endpoints, not points fabricated from LocationCurve.
            for index,point in enumerate((a,b)):
                try: add(c.GetEndPointReference(index),point)
                except Exception: pass
        except Exception: pass
    for candidates in ends:
        candidates.sort(key=lambda x:x[0])
    seen=set(reference_key(doc,a[0]) for a in alternatives)
    for first in ends[0][:6]:
        for last in ends[1][:6]:
            refs=[first[1],last[1]]
            key=reference_key(doc,refs)
            if key in seen or key[0]==key[1]:continue
            if last[2].Subtract(first[2]).DotProduct(direction)<=0.0001:continue
            seen.add(key)
            alternatives.append((refs,first[2],last[2]))
    return alternatives[:20]

def reference_key(doc, refs):
    return tuple(sorted(r.ConvertToStableRepresentation(doc) for r in refs))

def rectangle(points, view, padding):
    xs = [p.DotProduct(view.RightDirection) for p in points]
    ys = [p.DotProduct(view.UpDirection) for p in points]
    return (min(xs)-padding, min(ys)-padding, max(xs)+padding, max(ys)+padding)

def polygon_of_box(box):
    return [(box[0],box[1]),(box[2],box[1]),(box[2],box[3]),(box[0],box[3])]

def overlaps(a, b):
    # Separating axes handle diagonal wall footprints without huge axis-aligned boxes.
    for polygon in (a,b):
        for i,p in enumerate(polygon):
            q = polygon[(i+1)%len(polygon)]
            axis = (p[1]-q[1],q[0]-p[0])
            if abs(axis[0])+abs(axis[1])<0.000001: continue
            x = [point[0]*axis[0]+point[1]*axis[1] for point in a]
            y = [point[0]*axis[0]+point[1]*axis[1] for point in b]
            if max(x)<=min(y) or max(y)<=min(x): return False
    return True

def wall_footprint(wall,view):
    if isinstance(wall.Location,DB.LocationCurve) and isinstance(wall.Location.Curve,DB.Line):
        curve=wall.Location.Curve
        a,b=curve.GetEndPoint(0),curve.GetEndPoint(1)
        n=view.ViewDirection.CrossProduct(b.Subtract(a).Normalize()).Normalize().Multiply(wall.Width/2)
        points=[a.Add(n),b.Add(n),b.Subtract(n),a.Subtract(n)]
        return [(p.DotProduct(view.RightDirection),p.DotProduct(view.UpDirection)) for p in points]
    return None

def box_rectangle(box, view):
    points = [box.Transform.OfPoint(DB.XYZ(x,y,z)) for x in (box.Min.X,box.Max.X) for y in (box.Min.Y,box.Max.Y) for z in (box.Min.Z,box.Max.Z)]
    return rectangle(points, view, 0)

def project_to_view(point, view):
    return point.Subtract(view.ViewDirection.Multiply(point.Subtract(view.Origin).DotProduct(view.ViewDirection)))

def dimension_specs(wall, view, mode, offset):
    location = wall.Location
    if not isinstance(location, DB.LocationCurve) or not isinstance(location.Curve, DB.Line):
        raise ValueError('Parede curva ou sem eixo reto: nao suportada.')
    curve = location.Curve
    start, end = curve.GetEndPoint(0), curve.GetEndPoint(1)
    direction = end.Subtract(start).Normalize()
    if abs(direction.DotProduct(view.ViewDirection)) > 0.000001:
        raise ValueError('Eixo fora do plano da vista ativa.')
    normal = view.ViewDirection.CrossProduct(direction).Normalize()
    if normal.DotProduct(wall.Orientation) < 0:
        normal = normal.Negate()
    faces = faces_of(wall, view)
    specs, errors = [], []
    if mode != 'Espessura':
        alternatives=endpoint_candidates(wall,view,curve,start,end,direction,faces)
        if not alternatives:
            errors.append('Comprimento: eixo sem referencias nativas e nenhuma face/aresta referenciavel proxima das extremidades na vista.')
        for refs,p,q in alternatives:
            specs.append(('comprimento',refs,p,q,normal,wall.Width/2+offset))
    if mode != 'Comprimento':
        try:
            valid = {f.Reference.ConvertToStableRepresentation(getattr(wall,'Document',revit.doc)) for f in faces}
            sides = []
            for side in (DB.ShellLayerType.Interior, DB.ShellLayerType.Exterior):
                candidates = []
                for ref in DB.HostObjectUtils.GetSideFaces(wall, side):
                    face = wall.GetGeometryObjectFromReference(ref)
                    if isinstance(face, DB.PlanarFace) and abs(face.FaceNormal.DotProduct(normal)) >= ALIGNMENT and ref.ConvertToStableRepresentation(getattr(wall,'Document',revit.doc)) in valid:
                        candidates.append((face,ref))
                if not candidates:
                    raise ValueError('Face de acabamento sem referencia valida na vista.')
                sides.append(max(candidates,key=lambda pair:pair[0].Area))
            a,b = [pair[0].Origin.DotProduct(normal) for pair in sides]
            if abs(b-a) < 0.0001:
                raise ValueError('Faces coincidentes.')
            base = project_to_view(start,view)
            p = base.Add(normal.Multiply(a-start.DotProduct(normal)))
            q = base.Add(normal.Multiply(b-start.DotProduct(normal)))
            specs.append(('espessura',[pair[1] for pair in sides],p,q,direction.Negate(),offset))
        except Exception as error:
            errors.append('Espessura: {0}'.format(error))
    return specs,errors

def main():
    doc, view = revit.doc, revit.doc.ActiveView
    if doc.IsFamilyDocument or not isinstance(view, DB.ViewPlan) or view.IsTemplate:
        forms.alert('Abra uma vista de planta do projeto (piso, forro ou estrutural).',exitscript=True)
    walls = [doc.GetElement(eid) for eid in revit.uidoc.Selection.GetElementIds()]
    walls = [w for w in walls if isinstance(w,DB.Wall)]
    if not walls:
        try:
            refs = revit.uidoc.Selection.PickObjects(ObjectType.Element,'Selecione as paredes e clique Concluir')
            walls = [doc.GetElement(r.ElementId) for r in refs]
            walls = [w for w in walls if isinstance(w,DB.Wall)]
        except OperationCanceledException:
            return
    if not walls:
        forms.alert('Nenhuma parede selecionada.'); return
    mode = forms.ask_for_one_item(['Comprimento + Espessura','Comprimento','Espessura'],default='Comprimento + Espessura',prompt='Cotas a criar',title='Cotar paredes LAC')
    if not mode:
        return
    types = {revit.query.get_name(t):t for t in DB.FilteredElementCollector(doc).OfClass(DB.DimensionType) if t.StyleType == DB.DimensionStyleType.Linear}
    default_name = 'Padrao atual do Revit'
    chosen = forms.ask_for_one_item([default_name]+sorted(types),default=default_name,prompt='Tipo de cota',title='Cotar paredes LAC')
    if not chosen:
        return
    dimension_type = types.get(chosen)
    # 8 mm on paper: uniform offset across the batch, independent of wall rotation.
    offset = 0.008 * view.Scale / 0.3048
    padding = 0.003 * view.Scale / 0.3048
    # Outward from the selected assembly when several walls surround a room.
    center=None
    midpoints=[]
    for wall in walls:
        if isinstance(wall.Location,DB.LocationCurve) and isinstance(wall.Location.Curve,DB.Line):
            c=wall.Location.Curve
            midpoints.append(c.GetEndPoint(0).Add(c.GetEndPoint(1)).Multiply(0.5))
    if len(midpoints)>2:
        center=midpoints[0]
        for point in midpoints[1:]:center=center.Add(point)
        center=center.Multiply(1.0/len(midpoints))
    occupied, existing, messages = [], set(), []
    for element in DB.FilteredElementCollector(doc,view.Id).WhereElementIsNotElementType():
        if isinstance(element,(DB.Wall,DB.Dimension,DB.TextNote,DB.IndependentTag)):
            box = element.get_BoundingBox(view)
            if box:
                occupied.append(wall_footprint(element,view) or polygon_of_box(box_rectangle(box,view)) if isinstance(element,DB.Wall) else polygon_of_box(box_rectangle(box,view)))
        if isinstance(element,DB.Dimension):
            try:
                existing.add(reference_key(doc,list(element.References)))
            except Exception:
                pass
    visible_ids = {eid.Value for eid in DB.FilteredElementCollector(doc,view.Id).OfClass(DB.Wall).ToElementIds()}
    crop = box_rectangle(view.CropBox,view) if view.CropBoxActive else None
    created = 0
    group = DB.TransactionGroup(doc,'LAC - Cotar paredes')
    group.Start()
    try:
        for wall in walls:
            label = 'Parede {0}'.format(wall.Id.Value)
            try:
                if wall.Id.Value not in visible_ids or wall.IsHidden(view):
                    raise ValueError('Parede nao visivel na vista ativa.')
                specs, errors = dimension_specs(wall,view,mode,offset)
                messages.extend(label+' - '+e for e in errors)
                if center:
                    specs=[(kind,refs,p,q,away.Negate() if kind=='comprimento' and away.DotProduct(p.Add(q).Multiply(0.5).Subtract(center))<0 else away,base_offset) for kind,refs,p,q,away,base_offset in specs]
                kinds=[]
                for spec in specs:
                    if spec[0] not in kinds:kinds.append(spec[0])
                for kind in kinds:
                    attempts=[spec for spec in specs if spec[0]==kind]
                    failures=[]
                    accepted=False
                    # An existing cota using any of the alternative references wins.
                    if any(reference_key(doc,spec[1]) in existing for spec in attempts):
                        messages.append(label+' - '+kind+': cota ja existente.');continue
                    for _,refs,p,q,away,base_offset in attempts:
                        key=reference_key(doc,refs)
                        line,area=None,None
                        for band in range(16):
                            shift=away.Multiply(base_offset+band*offset)
                            a,b=p.Add(shift),q.Add(shift)
                            candidate=polygon_of_box(rectangle([a,b],view,padding))
                            inside_crop=not crop or all(crop[0]<=x<=crop[2] and crop[1]<=y<=crop[3] for x,y in candidate)
                            if inside_crop and not any(overlaps(candidate,box) for box in occupied):
                                line,area=DB.Line.CreateBound(a,b),candidate;break
                        if not line:
                            failures.append('sem espaco livre/fora do recorte');continue
                        transaction=DB.Transaction(doc,'LAC - Cota '+kind)
                        transaction.Start()
                        try:
                            references=DB.ReferenceArray()
                            for ref in refs:references.Append(ref)
                            if dimension_type:dim=doc.Create.NewDimension(view,line,references,dimension_type)
                            else:dim=doc.Create.NewDimension(view,line,references)
                            doc.Regenerate()
                            expected=q.Subtract(p).GetLength()
                            if dim is None or dim.Value is None or not dim.AreReferencesAvailable:
                                raise ValueError('Referencias rejeitadas pela vista.')
                            if abs(dim.Value-expected)>0.001:
                                raise ValueError('Referencia mede outra geometria, nao as extremidades propostas.')
                            if transaction.Commit()!=DB.TransactionStatus.Committed:
                                raise ValueError('Revit nao confirmou a cota.')
                            existing.add(key);occupied.append(area);created+=1;accepted=True;break
                        except Exception as error:
                            if transaction.GetStatus()==DB.TransactionStatus.Started:transaction.RollBack()
                            failures.append(str(error))
                        finally:
                            transaction.Dispose()
                    if not accepted:
                        messages.append(label+' - '+kind+': {0} alternativas tentadas; nenhuma cota associativa valida. {1}'.format(len(attempts),'; '.join(sorted(set(failures)))))
            except Exception as error:
                messages.append(label+' - '+str(error))
        group.Assimilate()
    except Exception:
        if group.GetStatus()==DB.TransactionStatus.Started: group.RollBack()
        raise
    finally:
        group.Dispose()
    output = script.get_output()
    output.print_md('## Cotagem LAC: {0} cota(s) criada(s)'.format(created))
    for message in messages: output.print_md('- '+message)
    forms.alert('{0} cota(s) criada(s). {1} aviso(s). Consulte o painel de resultados.'.format(created,len(messages)))

if __name__=='__main__':
    try: main()
    except Exception as error: forms.alert('Cotagem cancelada: {0}'.format(error))
