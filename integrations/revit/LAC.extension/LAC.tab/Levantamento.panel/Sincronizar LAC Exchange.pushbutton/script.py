# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import json,math
from datetime import datetime
from pyrevit import DB,forms,revit,script
from System.Collections.Generic import List
from lac_exchange import read_identity,write_identity,canonical

M=0.3048
def xyz(p):return DB.XYZ(float(p[0])/M,float(p[1])/M,float(p[2])/M)
def coords(p):return [round(p.X*M,8),round(p.Y*M,8),round(p.Z*M,8)]
def numeric(p):return isinstance(p,(int,float)) and not math.isnan(p) and not math.isinf(p)
def point_in_polygon(point,polygon):
    x,y=point[:2];inside=False;j=len(polygon)-1
    for i,a in enumerate(polygon):
        b=polygon[j]
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
        j=i
    return inside

def room_point(polygon):
    # Scanline midpoint stays inside concave polygons, unlike bounding-box centers.
    ys=sorted(set(p[1] for p in polygon));best=None
    for low,high in zip(ys,ys[1:]):
        if high-low<1e-7:continue
        y=(low+high)/2;xs=[]
        for i,a in enumerate(polygon):
            b=polygon[(i+1)%len(polygon)]
            if (a[1]>y)!=(b[1]>y):xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
        xs.sort()
        for a,b in zip(xs[::2],xs[1::2]):
            if best is None or b-a>best[0]:best=(b-a,[(a+b)/2,y,polygon[0][2]])
    if not best:raise ValueError('Ambiente sem ponto interno valido.')
    return best[1]

def boundary_residual(a,b):
    def distance(p,start,end):
        dx=end[0]-start[0];dy=end[1]-start[1];length=dx*dx+dy*dy
        t=max(0,min(1,((p[0]-start[0])*dx+(p[1]-start[1])*dy)/length)) if length else 0
        return math.hypot(p[0]-start[0]-t*dx,p[1]-start[1]-t*dy)
    def directed(points,edges):
        samples=[]
        for i,p in enumerate(points):
            q=points[(i+1)%len(points)]
            samples.extend([p,[(p[0]+q[0])/2,(p[1]+q[1])/2]])
        return max(min(distance(p,e,edges[(i+1)%len(edges)]) for i,e in enumerate(edges)) for p in samples)
    return max(directed(a,b),directed(b,a)) if a and b else float('inf')

def snapshot(element):
    result={'typeId':str(element.GetTypeId().Value)}
    if isinstance(element,DB.Level):return {'name':element.Name,'elevation':round(element.Elevation*M,8)}
    location=element.Location
    if isinstance(location,DB.LocationCurve):result['axis']=[coords(location.Curve.GetEndPoint(i)) for i in (0,1)]
    if isinstance(location,DB.LocationPoint):
        result['position']=coords(location.Point)
        try:result['rotation']=round(location.Rotation,8)
        except Exception:pass
    if isinstance(element,DB.FamilyInstance):
        result['host']=element.Host.UniqueId if element.Host else None
        result['dimensions']={}
        for name in ('Width','Largura','Depth','Profundidade','Height','Altura','b','h'):
            for owner in (element,element.Symbol):
                p=owner.LookupParameter(name) if owner else None
                if p and p.HasValue and p.StorageType==DB.StorageType.Double:result['dimensions'][name]=round(p.AsDouble()*M,8);break
    if isinstance(element,DB.Wall):
        result['thickness']=round(element.Width*M,8)
        result['height']=round(element.get_Parameter(DB.BuiltInParameter.WALL_USER_HEIGHT_PARAM).AsDouble()*M,8)
        result['baseLevel']=str(element.LevelId.Value)
    if isinstance(element,DB.SpatialElement):
        result['name']=revit.query.get_name(element)
        result['area']=round(element.Area*M*M,8)
        result['boundaries']=[[coords(s.GetCurve().GetEndPoint(0)) for s in loop] for loop in element.GetBoundarySegments(DB.SpatialElementBoundaryOptions()) or []]
    return result

def set_parameter(element,builtin,value):
    p=element.get_Parameter(builtin)
    if not p or p.IsReadOnly:raise ValueError('Parametro indisponivel ou somente leitura: '+str(builtin))
    p.Set(value)

def validate(data):
    if data.get('format')!='lac-exchange' or data.get('schemaVersion')!=1 or data.get('units')!='m':raise ValueError('Selecione LAC Exchange .lacx versao 1, em metros.')
    seen=set()
    for collection in ('levels','physicalWalls','openings','elements','rooms'):
        if not isinstance(data.get(collection),list):raise ValueError('Colecao ausente: '+collection)
        for item in data[collection]:
            key=item.get('lacId')
            if not key or key in seen:raise ValueError('Identidade ausente ou duplicada.')
            seen.add(key)
    return seen

def main():
    doc=revit.doc
    if doc.IsFamilyDocument:forms.alert('Abra um projeto Revit.');return
    path=forms.pick_file(file_ext='lacx',title='Selecionar LAC Exchange')
    if not path:return
    with open(path,'rb') as source:data=json.loads(source.read().decode('utf-8-sig'))
    incoming_ids=validate(data);project_id=data['project']['lacId'];registry=read_identity(doc.ProjectInformation)
    if registry.get('projectId') and registry['projectId']!=project_id:forms.alert('Este modelo ja esta vinculado a outro projeto LAC. Use outro documento.');return
    existing={};duplicates=set()
    for element in DB.FilteredElementCollector(doc).WhereElementIsNotElementType():
        identity=read_identity(element)
        if identity.get('projectId')==project_id and identity.get('lacId'):
            key=identity['lacId']
            if key in existing:duplicates.add(key)
            existing[key]=element
    if duplicates:raise ValueError('IDs LAC duplicados no Revit. Revise antes de sincronizar.')
    config=script.get_config();mappings=getattr(config,'exchange_mappings',{}) or {};report=[];failed=set()
    symbols=list(DB.FilteredElementCollector(doc).OfClass(DB.FamilySymbol))
    categories={'gap':DB.BuiltInCategory.OST_Doors,'door':DB.BuiltInCategory.OST_Doors,'window':DB.BuiltInCategory.OST_Windows,'Furniture':DB.BuiltInCategory.OST_Furniture,'Equipment':DB.BuiltInCategory.OST_MechanicalEquipment,'Column':DB.BuiltInCategory.OST_StructuralColumns,'Beam':DB.BuiltInCategory.OST_StructuralFraming,'GenericModel':DB.BuiltInCategory.OST_GenericModel}
    def symbol_for(record,element):
        if element and isinstance(element,DB.FamilyInstance):return element.Symbol
        category=record.get('type') if record.get('type') in ('door','window','gap') else record.get('category','GenericModel')
        key=canonical([project_id,category,record.get('type'),record.get('width'),record.get('height')])
        saved=doc.GetElement(mappings[key]) if key in mappings else None
        if isinstance(saved,DB.FamilySymbol):return saved
        choices={s.Family.Name+' / '+revit.query.get_name(s)+' ['+str(s.Id.Value)+']':s for s in symbols if category in categories and s.Category.Id.Value==int(categories[category])}
        if not choices:raise ValueError('Nenhuma familia carregada para '+category+'. Carregue e execute novamente.')
        label=forms.SelectFromList.show(sorted(choices),title='Mapear '+category+' / '+str(record.get('type',''))+' (cancelar = revisar)',multiselect=False)
        if not label:raise ValueError('Mapeamento pendente.')
        symbol=choices[label];mappings[key]=symbol.UniqueId;return symbol

    def wall_type(width):
        types=[t for t in DB.FilteredElementCollector(doc).OfClass(DB.WallType) if t.Kind==DB.WallKind.Basic]
        exact=next((t for t in types if abs(t.Width*M-width)<0.00001 and revit.query.get_name(t).startswith('LAC Exchange')),None)
        if exact:return exact
        if not types:raise ValueError('Carregue um tipo de parede basica.')
        name='LAC Exchange {0:g} mm'.format(width*1000);names=set(revit.query.get_name(t) for t in types);suffix=1;candidate=name
        while candidate in names:suffix+=1;candidate=name+' ('+str(suffix)+')'
        target=types[0].Duplicate(candidate);layers=List[DB.CompoundStructureLayer]()
        layers.Add(DB.CompoundStructureLayer(width/M,DB.MaterialFunctionAssignment.Structure,DB.ElementId.InvalidElementId))
        target.SetCompoundStructure(DB.CompoundStructure.CreateSimpleCompoundStructure(layers));return target

    def apply(kind,record,element):
        if kind=='levels':
            if not numeric(record['elevation']):raise ValueError('Elevacao invalida.')
            if element:element.Elevation=record['elevation']/M
            else:element=DB.Level.Create(doc,record['elevation']/M)
            names={l.Name for l in DB.FilteredElementCollector(doc).OfClass(DB.Level) if l.Id!=element.Id}
            name=record['name'];element.Name=name if name not in names else name+' - LAC '+str(element.Id.Value)
            return element
        level_key=record.get('baseLevelId') or record.get('levelId');level=existing.get(level_key)
        if not isinstance(level,DB.Level) or level_key in failed:raise ValueError('Pavimento nao sincronizado.')
        if kind=='physicalWalls':
            if record.get('curve'):raise ValueError('Parede curva preservada; edicao BIM requer revisao.')
            if not numeric(record.get('thickness')) or record['thickness']<=0 or not numeric(record.get('height')) or record['height']<=0:raise ValueError('Informe espessura e altura.')
            curve=DB.Line.CreateBound(xyz(record['start']),xyz(record['end']));typ=element.WallType if isinstance(element,DB.Wall) and abs(element.Width*M-record['thickness'])<.00001 else wall_type(record['thickness']);offset=record['start'][2]/M-level.Elevation
            if curve.Length<=doc.Application.ShortCurveTolerance:raise ValueError('Parede abaixo do comprimento minimo do Revit.')
            if element:
                element.ChangeTypeId(typ.Id);set_parameter(element,DB.BuiltInParameter.WALL_BASE_CONSTRAINT,level.Id);set_parameter(element,DB.BuiltInParameter.WALL_BASE_OFFSET,offset);element.Location.Curve=curve
                set_parameter(element,DB.BuiltInParameter.WALL_HEIGHT_TYPE,DB.ElementId.InvalidElementId);set_parameter(element,DB.BuiltInParameter.WALL_USER_HEIGHT_PARAM,record['height']/M)
            else:element=DB.Wall.Create(doc,curve,typ.Id,level.Id,record['height']/M,offset,False,False)
            if record.get('topLevelId'):
                top=existing.get(record['topLevelId'])
                if not isinstance(top,DB.Level):raise ValueError('Nivel superior indisponivel.')
                set_parameter(element,DB.BuiltInParameter.WALL_HEIGHT_TYPE,top.Id)
            return element
        if kind=='rooms':
            point=room_point(record['boundary']);location=xyz(point)
            if element:
                if element.LevelId!=level.Id:raise ValueError('Mudanca de nivel do Room requer revisao manual.')
                element.Location.Point=location
            else:element=doc.Create.NewRoom(level,DB.UV(location.X,location.Y))
            set_parameter(element,DB.BuiltInParameter.ROOM_NAME,record['name']);doc.Regenerate()
            if element.Area<=0 or not element.IsPointInRoom(DB.XYZ(location.X,location.Y,level.Elevation+1)):
                raise ValueError('Room sem regiao delimitada. Confira paredes Room Bounding e fase.')
            expected=abs(sum(p[0]*record['boundary'][(i+1)%len(record['boundary'])][1]-record['boundary'][(i+1)%len(record['boundary'])][0]*p[1] for i,p in enumerate(record['boundary'])))/2
            actual=element.Area*M*M
            loops=element.GetBoundarySegments(DB.SpatialElementBoundaryOptions()) or []
            boundary=[coords(s.GetCurve().GetEndPoint(0)) for s in loops[0]] if loops else []
            residual=boundary_residual(record['boundary'],boundary)
            if abs(actual-expected)>max(.01,expected*.005) or residual>.01 or len(loops)>1:
                answer=forms.CommandSwitchWindow.show(['Usar limites do Revit','Manter para revisao'],message='Geometria LAC difere do Room. LAC: {0:.3f} m2; Revit: {1:.3f} m2. Para usar geometria LAC, revise as paredes fisicas antes de repetir.'.format(expected,actual))
                if answer!='Usar limites do Revit':raise ValueError('Divergencia de Room mantida para revisao; operacao revertida.')
                report.append(record['lacId']+': limites Revit aceitos; exporte novamente para comparar no LAC.')
            return element
        if kind=='elements' and record.get('editable') is False:raise ValueError('Elemento externo de edicao limitada preservado no Revit.')
        host=existing.get(record.get('hostWallId') or record.get('hostId'))
        if kind=='openings' and (not isinstance(host,DB.Wall) or record.get('hostWallId') in failed):raise ValueError('Parede hospedeira nao sincronizada.')
        symbol=symbol_for(record,element)
        if not symbol.IsActive:symbol.Activate();doc.Regenerate()
        for field,builtin in (('width',DB.BuiltInParameter.DOOR_WIDTH),('height',DB.BuiltInParameter.DOOR_HEIGHT)):
            if kind=='openings' and numeric(record.get(field)):
                parameter=symbol.get_Parameter(builtin)
                if not parameter or abs(parameter.AsDouble()*M-record[field])>.001:raise ValueError('O tipo selecionado possui '+field+' diferente. Configure um tipo com as dimensoes do LAC.')
        location=xyz(record['position']);structural=DB.Structure.StructuralType.Column if record.get('category')=='Column' else DB.Structure.StructuralType.NonStructural
        if record.get('category')=='Beam':
            length=record.get('width')
            if not numeric(length) or length<=0:raise ValueError('Viga sem comprimento valido.')
            angle=float(record.get('rotation',0))*math.pi/180
            delta=DB.XYZ(math.cos(angle)*length/M/2,math.sin(angle)*length/M/2,0)
            curve=DB.Line.CreateBound(location-delta,location+delta)
            if element:
                if not isinstance(element.Location,DB.LocationCurve):raise ValueError('Viga sem eixo editavel.')
                element.Location.Curve=curve
            else:element=doc.Create.NewFamilyInstance(curve,symbol,level,DB.Structure.StructuralType.Beam)
            return element
        if element:
            if host and element.Host and element.Host.Id!=host.Id:raise ValueError('Troca de hospedeiro exige revisao manual.')
            if not isinstance(element.Location,DB.LocationPoint):raise ValueError('Familia sem localizacao pontual editavel.')
            element.Location.Point=location
        elif host:element=doc.Create.NewFamilyInstance(location,symbol,host,level,structural)
        else:element=doc.Create.NewFamilyInstance(location,symbol,level,structural)
        if kind=='elements':
            dimensions=(('width',('Width','Largura','b')),('depth',('Depth','Profundidade','h')),('height',('Height','Altura')))
            duplicated=False
            for field,names in dimensions:
                value=record.get(field)
                if value is None:continue
                if not numeric(value) or value<=0:raise ValueError('Dimensao invalida: '+field)
                instance_parameter=next((element.LookupParameter(n) for n in names if element.LookupParameter(n) and element.LookupParameter(n).StorageType==DB.StorageType.Double),None)
                parameter=instance_parameter or next((symbol.LookupParameter(n) for n in names if symbol.LookupParameter(n) and symbol.LookupParameter(n).StorageType==DB.StorageType.Double),None)
                if not parameter:raise ValueError('Mapeamento sem parametro de '+field+'. Ajuste a familia.')
                if abs(parameter.AsDouble()*M-value)<.0001:continue
                if parameter.IsReadOnly:raise ValueError('Dimensao controlada por formula: '+field)
                if not instance_parameter:
                    if not duplicated:
                        names_used=set(revit.query.get_name(t) for t in DB.FilteredElementCollector(doc).OfClass(DB.FamilySymbol) if t.Family.Id==symbol.Family.Id)
                        base='LAC '+str(element.Id.Value);name=base;counter=1
                        while name in names_used:counter+=1;name=base+' '+str(counter)
                        symbol=symbol.Duplicate(name);element.Symbol=symbol;duplicated=True
                    parameter=next((symbol.LookupParameter(n) for n in names if symbol.LookupParameter(n)),None)
                parameter.Set(value/M)
        if kind=='elements' and isinstance(element.Location,DB.LocationPoint):
            rotation=float(record.get('rotation',0))*math.pi/180-element.Location.Rotation
            if abs(rotation)>1e-8:DB.ElementTransformUtils.RotateElement(doc,element.Id,DB.Line.CreateBound(location,location+DB.XYZ.BasisZ),rotation)
        return element

    if not forms.alert('Sincronizar por IDs permanentes? Niveis, paredes, aberturas e elementos serao processados antes dos Rooms. Conflitos pedem escolha; itens incompativeis permanecem para revisao.'.replace('incompativeis','incompativeis'),yes=True,no=True):return
    with revit.Transaction('Sincronizar LAC Exchange'):
        for kind in ('levels','physicalWalls','openings','elements','rooms'):
            for record in data[kind]:
                key=record['lacId']
                if kind=='elements' and record.get('editable') is False:
                    report.append(key+': elemento externo preservado, sem edicao BIM.');continue
                element=existing.get(key)
                if not element and record.get('revitUniqueId'):
                    element=doc.GetElement(record['revitUniqueId'])
                    if element:existing[key]=element
                identity=read_identity(element) if element else {}
                if element and identity.get('projectId') and identity['projectId']!=project_id:failed.add(key);report.append(key+': pertence a outro projeto LAC.');continue
                try:
                    actual=snapshot(element) if element else None
                    lac_changed=canonical(identity.get('source'))!=canonical(record)
                    revit_changed=element is not None and identity.get('actual') is not None and canonical(identity['actual'])!=canonical(actual)
                    if revit_changed and lac_changed:
                        answer=forms.CommandSwitchWindow.show(['Usar LAC','Usar Revit','Manter para revisao'],message='Conflito em '+str(record.get('name') or record.get('type') or kind))
                        if answer!='Usar LAC':report.append(key+': Revit preservado; exporte para comparar.');continue
                    elif revit_changed or element and not lac_changed:continue
                    sub=DB.SubTransaction(doc);sub.Start()
                    try:
                        target=apply(kind,record,element);doc.Regenerate()
                        write_identity(target,{'projectId':project_id,'lacId':key,'source':record,'actual':snapshot(target),'lastSync':datetime.utcnow().isoformat()+'Z'})
                        sub.Commit();existing[key]=target
                    except Exception:sub.RollBack();raise
                except Exception as error:failed.add(key);report.append(key+': '+str(error))
        missing=[(key,e) for key,e in existing.items() if key not in incoming_ids]
        if data.get('syncMetadata',{}).get('complete') and missing and forms.alert('{0} elementos removidos no LAC. Excluir somente estes elementos gerenciados do Revit?'.format(len(missing)),yes=True,no=True):
            allowed=set(e.Id.Value for _,e in missing)
            sub=DB.SubTransaction(doc);sub.Start()
            try:
                for key,e in missing:
                    if not e.IsValidObject:continue
                    identity=read_identity(e)
                    if canonical(identity.get('actual'))!=canonical(snapshot(e)):raise ValueError('Elemento removido no LAC foi alterado no Revit: '+key)
                    removed=doc.Delete(e.Id)
                    if any(i.Value not in allowed for i in removed):raise ValueError('Exclusao afetaria elementos dependentes; revisar manualmente.')
                sub.Commit()
            except Exception as error:sub.RollBack();report.append('Exclusoes revertidas: '+str(error))
        write_identity(doc.ProjectInformation,{'projectId':project_id,'lastSync':datetime.utcnow().isoformat()+'Z'})
    config.exchange_mappings=mappings;script.save_config()
    output=script.get_output();output.print_md('## LAC Exchange: resultado')
    for line in report:output.print_md('- '+line)
    forms.alert('Processamento concluido. {0} item(ns) para revisao. Exporte Revit para LAC novamente para retornar IDs e limites reais. Confira o modelo antes de salvar.'.format(len(report)))

if __name__=='__main__':
    try:main()
    except Exception as error:forms.alert('Sincronizacao cancelada: {0}'.format(error))
