# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import os
import runpy
from pyrevit import DB, forms, revit, script
from Autodesk.Revit.UI.Selection import ObjectType
from Autodesk.Revit.Exceptions import OperationCanceledException

# Load helpers without executing the original command.
helpers=runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Cotar paredes.pushbutton','script.py'),run_name='lac_dimensions_helpers')
for helper in ('reference_key','rectangle','polygon_of_box','overlaps','wall_footprint','box_rectangle'):
    globals()[helper]=helpers[helper]

class LinkedView:
    native_view=None
    def __init__(self,view,inverse):
        self.Origin=inverse.OfPoint(view.Origin)
        self.ViewDirection=inverse.OfVector(view.ViewDirection).Normalize()
        self.RightDirection=inverse.OfVector(view.RightDirection).Normalize()
        self.UpDirection=inverse.OfVector(view.UpDirection).Normalize()

def linked_specs(wall,view,mode,offset,link,helpers):
    transform=link.GetTotalTransform()
    local_view=LinkedView(view,transform.Inverse)
    specifications,errors=helpers['dimension_specs'](wall,local_view,mode,offset)
    result=[]
    for kind,refs,p,q,away,distance in specifications:
        try:
            linked_refs=[ref.CreateLinkReference(link) for ref in refs]
            if not all(ref is not None and ref.ElementId==link.Id for ref in linked_refs):
                raise ValueError('Referencia nao pertence a instancia selecionada.')
            reference_key(revit.doc,linked_refs)
            p=helpers['project_to_view'](transform.OfPoint(p),view)
            q=helpers['project_to_view'](transform.OfPoint(q),view)
            result.append((kind,linked_refs,p,q,transform.OfVector(away).Normalize(),distance))
        except Exception as error:
            errors.append('{0}: conversao de referencia do vinculo recusada: {1}'.format(kind,error))
    return result,errors

def linked_footprint(wall,link,view,helpers):
    local=LinkedView(view,link.GetTotalTransform().Inverse)
    # Local footprint coordinates already use the inverse host basis, but translation
    # must be included. Get actual model points instead of reconstructing 2D points.
    if isinstance(wall.Location,DB.LocationCurve) and isinstance(wall.Location.Curve,DB.Line):
        curve=wall.Location.Curve;a,b=curve.GetEndPoint(0),curve.GetEndPoint(1)
        n=local.ViewDirection.CrossProduct(b.Subtract(a).Normalize()).Normalize().Multiply(wall.Width/2)
        points=[link.GetTotalTransform().OfPoint(p) for p in (a.Add(n),b.Add(n),b.Subtract(n),a.Subtract(n))]
        return [(p.DotProduct(view.RightDirection),p.DotProduct(view.UpDirection)) for p in points]
    box=wall.get_BoundingBox(None)
    if box:
        transformed=[]
        for x in (box.Min.X,box.Max.X):
            for y in (box.Min.Y,box.Max.Y):
                for z in (box.Min.Z,box.Max.Z):
                    transformed.append(link.GetTotalTransform().OfPoint(box.Transform.OfPoint(DB.XYZ(x,y,z))))
        return polygon_of_box(rectangle(transformed,view,0))
    return None

def main():
    doc,view=revit.doc,revit.doc.ActiveView
    if doc.IsFamilyDocument or not isinstance(view,DB.ViewPlan) or view.IsTemplate:
        forms.alert('Abra uma planta do projeto PPCI.',exitscript=True)
    selected=[doc.GetElement(eid) for eid in revit.uidoc.Selection.GetElementIds()]
    links=[element for element in selected if isinstance(element,DB.RevitLinkInstance)]
    if len(links)==1:link=links[0]
    else:
        try:
            reference=revit.uidoc.Selection.PickObject(ObjectType.Element,'Selecione a instancia do vinculo arquitetonico')
            link=doc.GetElement(reference.ElementId)
        except OperationCanceledException:return
    if not isinstance(link,DB.RevitLinkInstance):
        forms.alert('Selecione uma instancia de vinculo Revit.');return
    linked_doc=link.GetLinkDocument()
    if linked_doc is None:
        forms.alert('O vinculo esta descarregado. Carregue-o antes de cotar.');return
    if link.IsHidden(view):
        forms.alert('O vinculo esta oculto nesta vista.');return
    try:
        visible_walls=list(DB.FilteredElementCollector(doc,view.Id,link.Id).OfClass(DB.Wall).WhereElementIsNotElementType())
    except Exception as error:
        forms.alert('Nao foi possivel obter as paredes visiveis da instancia: {0}'.format(error));return
    crop=box_rectangle(view.CropBox,view) if view.CropBoxActive else None
    if crop:
        visible_walls=[w for w in visible_walls if linked_footprint(w,link,view,helpers) and overlaps(linked_footprint(w,link,view,helpers),polygon_of_box(crop))]
    visible_counts={}
    for wall in visible_walls:visible_counts[wall.GetTypeId().Value]=visible_counts.get(wall.GetTypeId().Value,0)+1
    type_choices={}
    for wall in DB.FilteredElementCollector(linked_doc).OfClass(DB.Wall).WhereElementIsNotElementType():
        type_id=wall.GetTypeId()
        wall_type=linked_doc.GetElement(type_id)
        label='{0} [tipo {1}] - {2} visivel(is)'.format(revit.query.get_name(wall_type),type_id.Value,visible_counts.get(type_id.Value,0))
        type_choices[label]=type_id.Value
    if not type_choices:
        forms.alert('O vinculo nao possui paredes.');return
    chosen_types=forms.SelectFromList.show(sorted(type_choices),title='Tipos de parede do vinculo',button_name='Cotar tipos selecionados',multiselect=True)
    if not chosen_types:return
    type_ids={type_choices[label] for label in chosen_types}
    walls=[wall for wall in visible_walls if wall.GetTypeId().Value in type_ids]
    if not walls:
        forms.alert('Nenhuma parede dos tipos escolhidos esta visivel nesta vista.');return
    mode=forms.ask_for_one_item(['Comprimento + Espessura','Comprimento','Espessura'],default='Comprimento + Espessura',prompt='Cotas a criar no PPCI',title='Cotar paredes do vinculo')
    if not mode:return
    types={revit.query.get_name(t):t for t in DB.FilteredElementCollector(doc).OfClass(DB.DimensionType) if t.StyleType==DB.DimensionStyleType.Linear}
    default_name='Padrao atual do Revit'
    chosen=forms.ask_for_one_item([default_name]+sorted(types),default=default_name,prompt='Tipo de cota do PPCI',title='Cotar paredes do vinculo')
    if not chosen:return
    dimension_type=types.get(chosen)
    # 8 mm on paper: uniform offset across the batch, independent of wall rotation.
    offset = 0.008 * view.Scale / 0.3048
    padding = 0.003 * view.Scale / 0.3048
    # Outward from the selected assembly when several walls surround a room.
    center=None
    midpoints=[]
    for wall in walls:
        if isinstance(wall.Location,DB.LocationCurve) and isinstance(wall.Location.Curve,DB.Line):
            c=wall.Location.Curve
            midpoints.append(link.GetTotalTransform().OfPoint(c.GetEndPoint(0).Add(c.GetEndPoint(1)).Multiply(0.5)))
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
    for linked_wall in visible_walls:
        footprint=linked_footprint(linked_wall,link,view,helpers)
        if footprint:occupied.append(footprint)
    visible_ids = {wall.Id.Value for wall in walls}
    crop = box_rectangle(view.CropBox,view) if view.CropBoxActive else None
    created = 0
    group = DB.TransactionGroup(doc,'LAC - Cotar paredes')
    group.Start()
    try:
        for wall in walls:
            label = 'Vinculo {0} / Parede {1}'.format(link.Id.Value,wall.Id.Value)
            try:
                if wall.Id.Value not in visible_ids:
                    raise ValueError('Parede nao visivel na vista ativa.')
                specs, errors = linked_specs(wall,view,mode,offset,link,helpers)
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
    try:main()
    except Exception as error:forms.alert('Cotagem do vinculo cancelada: {0}'.format(error))
