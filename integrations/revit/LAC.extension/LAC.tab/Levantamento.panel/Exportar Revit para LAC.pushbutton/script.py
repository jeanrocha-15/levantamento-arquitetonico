# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import json
import math
import os
import re
import tempfile
from datetime import datetime
from System import Int64
from pyrevit import DB, forms, revit, script
from Autodesk.Revit.UI.Selection import ObjectType
from Autodesk.Revit.Exceptions import OperationCanceledException

METERS_PER_FOOT=0.3048
FORMAT='revit-lac-exchange'
SCHEMA_VERSION=1

def element_ref(element):
    if element is None:return None
    return {'elementId':str(element.Id.Value),'uniqueId':element.UniqueId}

def resolve_ref(doc,element_id):
    if element_id is None or element_id==DB.ElementId.InvalidElementId:return None
    element=doc.GetElement(element_id)
    return element_ref(element) if element else {'elementId':str(element_id.Value),'uniqueId':None}

def xyz(point):
    return [point.X*METERS_PER_FOOT,point.Y*METERS_PER_FOOT,point.Z*METERS_PER_FOOT]

def curve_data(curve,transform):
    result={'kind':curve.GetType().Name,'isBound':curve.IsBound,'isStraight':isinstance(curve,DB.Line)}
    if curve.IsBound:
        result['lengthM']=curve.Length*METERS_PER_FOOT
        a,b=curve.GetEndPoint(0),curve.GetEndPoint(1)
        result.update({'start':xyz(a),'end':xyz(b),'hostStart':xyz(transform.OfPoint(a)),'hostEnd':xyz(transform.OfPoint(b))})
    elif isinstance(curve,DB.Line):
        result['origin']=xyz(curve.Origin);result['hostOrigin']=xyz(transform.OfPoint(curve.Origin))
        result['direction']=[curve.Direction.X,curve.Direction.Y,curve.Direction.Z]
        host_direction=transform.OfVector(curve.Direction)
        result['hostDirection']=[host_direction.X,host_direction.Y,host_direction.Z]
    if isinstance(curve,DB.Arc):
        result.update({'center':xyz(curve.Center),'hostCenter':xyz(transform.OfPoint(curve.Center)),'radiusM':curve.Radius*METERS_PER_FOOT,'normal':[curve.Normal.X,curve.Normal.Y,curve.Normal.Z]})
    if not isinstance(curve,DB.Line):
        points=list(curve.Tessellate())
        result['samples']=[xyz(p) for p in points]
        result['hostSamples']=[xyz(transform.OfPoint(p)) for p in points]
        result['samplesAreApproximate']=True
    return result

def box_data(element,transform):
    box=element.get_BoundingBox(None)
    if not box:return None
    corners=[box.Transform.OfPoint(DB.XYZ(x,y,z)) for x in (box.Min.X,box.Max.X) for y in (box.Min.Y,box.Max.Y) for z in (box.Min.Z,box.Max.Z)]
    return {'sourceCorners':[xyz(p) for p in corners],'hostCorners':[xyz(transform.OfPoint(p)) for p in corners],'isApproximation':True}

def parameter_data(parameter,doc):
    definition=parameter.Definition
    result={'name':definition.Name,'parameterId':str(parameter.Id.Value),'storageType':str(parameter.StorageType),'hasValue':parameter.HasValue}
    try:result['specId']=definition.GetDataType().TypeId
    except Exception:pass
    if not parameter.HasValue:return result
    if parameter.StorageType==DB.StorageType.String:result['value']=parameter.AsString()
    elif parameter.StorageType==DB.StorageType.Integer:result['value']=parameter.AsInteger()
    elif parameter.StorageType==DB.StorageType.ElementId:result['reference']=resolve_ref(doc,parameter.AsElementId())
    elif parameter.StorageType==DB.StorageType.Double:
        value=parameter.AsDouble()
        if math.isnan(value) or math.isinf(value):
            result['invalidValue']=str(value);return result
        result['valueInternal']=value
        try:
            spec=definition.GetDataType()
            if spec==DB.SpecTypeId.Length:result.update({'value':value*METERS_PER_FOOT,'unit':'m'})
            elif spec==DB.SpecTypeId.Area:result.update({'value':value*METERS_PER_FOOT**2,'unit':'m2'})
            elif spec==DB.SpecTypeId.Volume:result.update({'value':value*METERS_PER_FOOT**3,'unit':'m3'})
            elif spec==DB.SpecTypeId.Angle:result.update({'value':value*180/math.pi,'unit':'degrees'})
            result['formatted']=parameter.AsValueString()
        except Exception:pass
    return result

def parameters_of(element,doc):
    result=[]
    for parameter in element.Parameters:
        try:result.append(parameter_data(parameter,doc))
        except Exception as error:result.append({'name':getattr(parameter.Definition,'Name','?'),'readError':'{0}'.format(error)})
    return result

def length_parameter(element,builtin):
    parameter=element.get_Parameter(builtin)
    if parameter and parameter.HasValue and parameter.StorageType==DB.StorageType.Double:return parameter.AsDouble()*METERS_PER_FOOT
    return None

def family_length(instance,builtin):
    value=length_parameter(instance,builtin)
    if value is None and instance.Symbol:value=length_parameter(instance.Symbol,builtin)
    return value

def room_boundaries(room,doc,transform):
    options=DB.SpatialElementBoundaryOptions()
    options.SpatialElementBoundaryLocation=DB.SpatialElementBoundaryLocation.Finish
    try:
        loops=room.GetBoundarySegments(options)
        return [[{'element':resolve_ref(doc,segment.ElementId),'curve':curve_data(segment.GetCurve(),transform)} for segment in loop] for loop in loops or []]
    finally:options.Dispose()

def classify(element):
    if isinstance(element,DB.Opening):return 'opening'
    category=element.Category
    if not category:return 'unknown'
    value=category.Id.Value
    mapping={int(DB.BuiltInCategory.OST_Walls):'wall',int(DB.BuiltInCategory.OST_Rooms):'room',int(DB.BuiltInCategory.OST_MEPSpaces):'space',int(DB.BuiltInCategory.OST_Doors):'door',int(DB.BuiltInCategory.OST_Windows):'window',int(DB.BuiltInCategory.OST_Floors):'floor',int(DB.BuiltInCategory.OST_Roofs):'roof',int(DB.BuiltInCategory.OST_StructuralColumns):'structural_column',int(DB.BuiltInCategory.OST_Columns):'column',int(DB.BuiltInCategory.OST_StructuralFraming):'structural_framing',int(DB.BuiltInCategory.OST_Furniture):'furniture',int(DB.BuiltInCategory.OST_MechanicalEquipment):'mechanical_equipment',int(DB.BuiltInCategory.OST_ElectricalEquipment):'electrical_equipment',int(DB.BuiltInCategory.OST_PlumbingFixtures):'plumbing_fixture',int(DB.BuiltInCategory.OST_Stairs):'stairs',int(DB.BuiltInCategory.OST_Ramps):'ramp',int(DB.BuiltInCategory.OST_Ceilings):'ceiling'}
    return mapping.get(value,'other_model_element')

def level_ref(element,doc):
    reference=resolve_ref(doc,element.LevelId)
    if not reference:
        host=getattr(element,'Host',None)
        if host:reference=resolve_ref(doc,host.LevelId)
    return reference

def serialize_element(element,doc,transform,detailed):
    kind=classify(element)
    result=element_ref(element)
    result.update({'name':revit.query.get_name(element),'kind':kind,'class':element.GetType().FullName,'category':{'id':element.Category.Id.Value,'name':element.Category.Name},'type':resolve_ref(doc,element.GetTypeId()),'level':level_ref(element,doc),'issues':[]})
    try:
        result['createdPhase']=resolve_ref(doc,element.CreatedPhaseId)
        result['demolishedPhase']=resolve_ref(doc,element.DemolishedPhaseId)
    except Exception:pass
    try:result['boundingBox']=box_data(element,transform)
    except Exception as error:result['issues'].append('Bounding box: {0}'.format(error))
    location=element.Location
    if isinstance(location,DB.LocationCurve):
        try:result['axis']=curve_data(location.Curve,transform)
        except Exception as error:result['issues'].append('Eixo: {0}'.format(error))
    elif isinstance(location,DB.LocationPoint):
        result['position']=xyz(location.Point);result['hostPosition']=xyz(transform.OfPoint(location.Point));result['rotationDegrees']=location.Rotation*180/math.pi
    if isinstance(element,DB.Wall):
        result['thicknessM']=element.Width*METERS_PER_FOOT
        result['unconnectedHeightM']=length_parameter(element,DB.BuiltInParameter.WALL_USER_HEIGHT_PARAM)
        result['baseOffsetM']=length_parameter(element,DB.BuiltInParameter.WALL_BASE_OFFSET)
        result['topOffsetM']=length_parameter(element,DB.BuiltInParameter.WALL_TOP_OFFSET)
        top=element.get_Parameter(DB.BuiltInParameter.WALL_HEIGHT_TYPE)
        result['topConstraint']=resolve_ref(doc,top.AsElementId()) if top else None
        result['heightFromBoundingBoxIsNotSurveyed']=True
    if isinstance(element,DB.SpatialElement):
        try:result['boundaryLoops']=room_boundaries(element,doc,transform)
        except Exception as error:result['issues'].append('Contorno: {0}'.format(error))
        if not result.get('boundaryLoops'):result['issues'].append('Sem contorno: ambiente nao colocado/fechado ou dados indisponiveis.')
        result['boundaryFace']='finish'
        try:result['areaM2']=element.Area*METERS_PER_FOOT**2
        except Exception:pass
        try:result['volumeM3']=element.Volume*METERS_PER_FOOT**3
        except Exception:pass
        try:result['unboundedHeightM']=element.UnboundedHeight*METERS_PER_FOOT;result['heightSource']='Revit.UnboundedHeight (not surveyed ceiling height)'
        except Exception:pass
    try:
        generic_host=getattr(element,'Host',None)
        if generic_host:result['host']=element_ref(generic_host)
    except Exception:pass
    if isinstance(element,DB.FamilyInstance):
        result['host']=element_ref(element.Host)
        result['familyName']=element.Symbol.Family.Name if element.Symbol else None
        try:result['room']=element_ref(element.Room)
        except Exception:pass
        try:result['instanceTransform']=transform_data(element.GetTransform());result['isMirrored']=element.Mirrored
        except Exception:pass
        if kind in ('door','window'):
            result['widthM']=family_length(element,DB.BuiltInParameter.DOOR_WIDTH if kind=='door' else DB.BuiltInParameter.WINDOW_WIDTH)
            result['heightM']=family_length(element,DB.BuiltInParameter.DOOR_HEIGHT if kind=='door' else DB.BuiltInParameter.WINDOW_HEIGHT)
            if kind=='window':result['sillHeightM']=length_parameter(element,DB.BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM)
            for name in ('FromRoom','ToRoom','Room'):
                try:result[name[0].lower()+name[1:]]=element_ref(getattr(element,name))
                except Exception:pass
            result['roomAssociationPhase']='Revit default (last phase); review phase before conversion'
    if detailed:
        result['parameters']=parameters_of(element,doc)
        try:result['materials']=[resolve_ref(doc,material_id) for material_id in element.GetMaterialIds(False)]
        except Exception:pass
    return result

def reference_data(reference,doc):
    record={'element':resolve_ref(doc,reference.ElementId)}
    try:record['linkedElementId']=str(reference.LinkedElementId.Value)
    except Exception:pass
    try:record['stableRepresentation']=reference.ConvertToStableRepresentation(doc)
    except Exception as error:record['issue']='{0}'.format(error)
    return record

def view_data(view,doc,transform,detailed):
    result=dict(element_ref(view),name=revit.query.get_name(view),kind='view',viewType=str(view.ViewType),isTemplate=view.IsTemplate)
    try:result['level']=element_ref(view.GenLevel)
    except Exception:result['level']=None
    try:
        result.update({'origin':xyz(view.Origin),'hostOrigin':xyz(transform.OfPoint(view.Origin)),'direction':[view.ViewDirection.X,view.ViewDirection.Y,view.ViewDirection.Z],'right':[view.RightDirection.X,view.RightDirection.Y,view.RightDirection.Z],'up':[view.UpDirection.X,view.UpDirection.Y,view.UpDirection.Z],'scale':view.Scale})
    except Exception:pass
    try:
        result['cropActive']=view.CropBoxActive
        result['cropMin']=xyz(view.CropBox.Min);result['cropMax']=xyz(view.CropBox.Max)
    except Exception:pass
    try:result['template']=resolve_ref(doc,view.ViewTemplateId)
    except Exception:pass
    if detailed:result['parameters']=parameters_of(view,doc)
    return result

def dimension_data(dimension,doc,transform,detailed):
    result=dict(element_ref(dimension),kind='dimension',ownerView=resolve_ref(doc,dimension.OwnerViewId),type=resolve_ref(doc,dimension.GetTypeId()),issues=[])
    style=str(dimension.DimensionType.StyleType)
    angular=style=='Angular'
    result['style']=style;result['unit']='degrees' if angular else 'm'
    def value_of(value):return None if value is None else value*(180/math.pi if angular else METERS_PER_FOOT)
    for name in ('Prefix','Suffix','Above','Below','ValueOverride'):
        try:result[name[0].lower()+name[1:]]=getattr(dimension,name)
        except Exception:pass
    try:result['value']=value_of(dimension.Value)
    except Exception:result['value']=None
    try:result['textPosition']=xyz(dimension.TextPosition);result['hostTextPosition']=xyz(transform.OfPoint(dimension.TextPosition))
    except Exception:pass
    try:result['valueString']=dimension.ValueString
    except Exception:pass
    try:result['referencesAvailable']=dimension.AreReferencesAvailable
    except Exception:pass
    try:result['curve']=curve_data(dimension.Curve,transform)
    except Exception:pass
    try:result['references']=[reference_data(ref,doc) for ref in dimension.References]
    except Exception as error:result['issues'].append('Referencias: {0}'.format(error))
    result['segments']=[]
    try:
        for segment in dimension.Segments:
            item={'value':value_of(segment.Value)}
            for name in ('ValueString','ValueOverride','Prefix','Suffix','Above','Below'):
                try:item[name[0].lower()+name[1:]]=getattr(segment,name)
                except Exception:pass
            try:item['textPosition']=xyz(segment.TextPosition);item['hostTextPosition']=xyz(transform.OfPoint(segment.TextPosition))
            except Exception:pass
            result['segments'].append(item)
    except Exception:pass
    if detailed:result['parameters']=parameters_of(dimension,doc)
    return result

def annotation_data(element,doc,transform,detailed):
    result=dict(element_ref(element),kind='annotation',className=element.GetType().FullName,category=element.Category.Name if element.Category else None,ownerView=resolve_ref(doc,element.OwnerViewId),type=resolve_ref(doc,element.GetTypeId()))
    if isinstance(element,DB.TextNote):
        result['text']=element.Text
        result['position']=xyz(element.Coord);result['hostPosition']=xyz(transform.OfPoint(element.Coord))
    elif isinstance(element,DB.CurveElement):
        try:result['curve']=curve_data(element.GeometryCurve,transform)
        except Exception:pass
    elif isinstance(element,DB.IndependentTag):
        try:result['text']=element.TagText
        except Exception:pass
        try:result['taggedElements']=[{'hostElementId':str(item.HostElementId.Value),'linkInstanceId':str(item.LinkInstanceId.Value),'linkedElementId':str(item.LinkedElementId.Value)} for item in element.GetTaggedElementIds()]
        except Exception:pass
    if isinstance(element,DB.Viewport):
        result['placedView']=resolve_ref(doc,element.ViewId)
    if detailed:result['parameters']=parameters_of(element,doc)
    return result

def transform_data(transform):
    return {'originM':xyz(transform.Origin),'basisX':[transform.BasisX.X,transform.BasisX.Y,transform.BasisX.Z],'basisY':[transform.BasisY.X,transform.BasisY.Y,transform.BasisY.Z],'basisZ':[transform.BasisZ.X,transform.BasisZ.Y,transform.BasisZ.Z],'isMirrored':transform.Determinant<0}

def main():
    host=revit.doc
    if host.IsFamilyDocument:forms.alert('Abra um projeto Revit, nao uma familia.',exitscript=True)
    source_choice=forms.ask_for_one_item(['Projeto aberto','Vinculo Revit'],default='Projeto aberto',prompt='Origem dos dados',title='Exportar Revit para LAC')
    if not source_choice:return
    doc,link,transform=host,None,DB.Transform.Identity
    if source_choice=='Vinculo Revit':
        selected=[host.GetElement(eid) for eid in revit.uidoc.Selection.GetElementIds()]
        links=[element for element in selected if isinstance(element,DB.RevitLinkInstance)]
        if len(links)==1:link=links[0]
        else:
            try:link=host.GetElement(revit.uidoc.Selection.PickObject(ObjectType.Element,'Selecione o vinculo arquitetonico').ElementId)
            except OperationCanceledException:return
        if not isinstance(link,DB.RevitLinkInstance):forms.alert('Selecione uma instancia de vinculo Revit.');return
        doc=link.GetLinkDocument()
        if doc is None:forms.alert('Vinculo descarregado.');return
        transform=link.GetTotalTransform()
    all_levels=list(DB.FilteredElementCollector(doc).OfClass(DB.Level))
    scope=forms.ask_for_one_item(['Todos os pavimentos','Escolher pavimentos'],default='Todos os pavimentos',prompt='Pavimentos a exportar',title='Exportar Revit para LAC')
    if not scope:return
    selected_levels=all_levels
    if scope=='Escolher pavimentos':
        choices={'{0} [id {1}]'.format(revit.query.get_name(level),level.Id.Value):level for level in all_levels}
        selected=forms.SelectFromList.show(sorted(choices),title='Pavimentos',multiselect=True)
        if not selected:return
        selected_levels=[choices[label] for label in selected]
    selected_ids={str(level.Id.Value) for level in selected_levels}
    detail=forms.ask_for_one_item(['Detalhado (inclui parametros e materiais)','Essencial'],default='Detalhado (inclui parametros e materiais)',prompt='Detalhamento do arquivo para analise',title='Exportar Revit para LAC')
    if not detail:return
    name=re.sub(r'[<>:"/\\|?*]','_',doc.Title)
    path=forms.save_file(file_ext='json',default_name='Revit-LAC-'+name+'.json')
    if not path:return
    data={'format':FORMAT,'schemaVersion':SCHEMA_VERSION,'units':'m','coordinateSystem':'Revit XYZ, right-handed, Z up; no centering or scaling','exportedAt':datetime.utcnow().isoformat()+'Z','source':{'documentId':doc.ProjectInformation.UniqueId,'title':doc.Title,'revitVersion':host.Application.VersionNumber,'revitBuild':host.Application.VersionBuild,'linkInstance':element_ref(link),'hostDocumentId':host.ProjectInformation.UniqueId,'transformToHost':transform_data(transform)},'scope':{'levels':[element_ref(level) for level in selected_levels],'allLevels':scope=='Todos os pavimentos','detail':detail},'levels':[dict(element_ref(level),name=revit.query.get_name(level),elevationM=level.Elevation*METERS_PER_FOOT,hostOrigin=xyz(transform.OfPoint(DB.XYZ(0,0,level.Elevation)))) for level in selected_levels],'phases':[dict(element_ref(phase),name=revit.query.get_name(phase)) for phase in doc.Phases],'elements':[],'types':[],'materials':[],'grids':[],'coordinateReference':{},'projectUnits':{},'views':[],'dimensions':[],'annotations':[],'warnings':[],'limitations':['Exchange/inventory, not a LAC backup. Conversion to editable LAC elements requires validation.','Curves and unsupported categories are preserved as source records; no silent straightening.','Bounding boxes and tessellation are approximate and not fabrication dimensions.','Room/door phase associations must be reviewed. Nested links are recorded but not traversed.']}
    try:
        position=doc.ActiveProjectLocation.GetProjectPosition(DB.XYZ.Zero)
        data['coordinateReference']={'projectLocationName':doc.ActiveProjectLocation.Name,'eastWestM':position.EastWest*METERS_PER_FOOT,'northSouthM':position.NorthSouth*METERS_PER_FOOT,'elevationM':position.Elevation*METERS_PER_FOOT,'trueNorthAngleDegrees':position.Angle*180/math.pi}
    except Exception as error:data['warnings'].append('Coordenadas compartilhadas: {0}'.format(error))
    for key,spec in (('length',DB.SpecTypeId.Length),('area',DB.SpecTypeId.Area),('volume',DB.SpecTypeId.Volume)):
        try:
            options=doc.GetUnits().GetFormatOptions(spec)
            data['projectUnits'][key]={'unitId':options.GetUnitTypeId().TypeId,'accuracyInDisplayUnit':options.Accuracy}
        except Exception:pass
    for grid in DB.FilteredElementCollector(doc).OfClass(DB.Grid):
        try:data['grids'].append(dict(element_ref(grid),name=revit.query.get_name(grid),curve=curve_data(grid.Curve,transform)))
        except Exception as error:data['warnings'].append('Eixo {0}: {1}'.format(grid.Id.Value,error))
    elements=[element for element in DB.FilteredElementCollector(doc).WhereElementIsNotElementType().WhereElementIsViewIndependent() if element.Category and element.Category.CategoryType==DB.CategoryType.Model]
    used_types=set();used_materials=set();skipped=0
    with forms.ProgressBar(title='Exportando {value}/{max_value}',cancellable=True,step=20) as progress:
        for index,element in enumerate(elements):
            if progress.cancelled:return
            progress.update_progress(index+1,len(elements))
            try:
                level=level_ref(element,doc)
                if scope!='Todos os pavimentos' and (not level or level['elementId'] not in selected_ids):skipped+=1;continue
                record=serialize_element(element,doc,transform,detail.startswith('Detalhado'))
                data['elements'].append(record)
                if record.get('type'):used_types.add(record['type']['elementId'])
                for material in record.get('materials',[]):
                    if material:used_materials.add(material['elementId'])
            except Exception as error:
                data['elements'].append(dict(element_ref(element),kind='unreadable',issues=['{0}'.format(error)]))
                data['warnings'].append('Elemento {0}: {1}'.format(element.Id.Value,error))
    exported_views=[]
    for view in DB.FilteredElementCollector(doc).OfClass(DB.View):
        if view.IsTemplate:continue
        if scope!='Todos os pavimentos':
            gen=getattr(view,'GenLevel',None)
            if gen is not None and str(gen.Id.Value) not in selected_ids:continue
        exported_views.append(view)
        try:data['views'].append(view_data(view,doc,transform,detail.startswith('Detalhado')))
        except Exception as error:data['warnings'].append('Vista {0}: {1}'.format(view.Id.Value,error))
    view_ids={view.Id.Value for view in exported_views}
    for dimension in DB.FilteredElementCollector(doc).OfClass(DB.Dimension):
        if dimension.OwnerViewId.Value not in view_ids:continue
        try:
            record=dimension_data(dimension,doc,transform,detail.startswith('Detalhado'))
            data['dimensions'].append(record)
            if record.get('type'):used_types.add(record['type']['elementId'])
        except Exception as error:data['warnings'].append('Cota {0}: {1}'.format(dimension.Id.Value,error))
    # Text, tags, detail curves and view symbols are separate from physical model elements.
    for element in DB.FilteredElementCollector(doc).WhereElementIsNotElementType():
        if not element.ViewSpecific or element.OwnerViewId.Value not in view_ids or isinstance(element,DB.Dimension):continue
        try:
            record=annotation_data(element,doc,transform,detail.startswith('Detalhado'))
            data['annotations'].append(record)
            if record.get('type'):used_types.add(record['type']['elementId'])
        except Exception as error:data['warnings'].append('Anotacao {0}: {1}'.format(element.Id.Value,error))
    for type_id in sorted(used_types):
        element=doc.GetElement(DB.ElementId(Int64(type_id)))
        if element:
            record=dict(element_ref(element),name=revit.query.get_name(element),parameters=parameters_of(element,doc) if detail.startswith('Detalhado') else [])
            try:
                structure=element.GetCompoundStructure()
                if structure:
                    record['layers']=[{'widthM':layer.Width*METERS_PER_FOOT,'function':str(layer.Function),'material':resolve_ref(doc,layer.MaterialId)} for layer in structure.GetLayers()]
                    for layer in record['layers']:
                        if layer['material']:used_materials.add(layer['material']['elementId'])
            except Exception:pass
            data['types'].append(record)
    for material_id in sorted(used_materials):
        element=doc.GetElement(DB.ElementId(Int64(material_id)))
        if element:data['materials'].append(dict(element_ref(element),name=revit.query.get_name(element)))
    counts={}
    for record in data['elements']:counts[record['kind']]=counts.get(record['kind'],0)+1
    data['summary']={'byKind':counts,'totalElements':len(data['elements']),'elementsOutsideSelectedLevels':skipped,'unassignedLevel':sum(1 for e in data['elements'] if not e.get('level')),'roomCount':counts.get('room',0),'issueCount':sum(len(e.get('issues',[])) for e in data['elements']),'dimensionCount':len(data['dimensions']),'annotationCount':len(data['annotations']),'viewCount':len(data['views'])}
    if not data['summary']['roomCount']:data['warnings'].append('Sem Rooms/Ambientes cadastrados. Nao foram inventados ambientes a partir de paredes.')
    payload=json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2).encode('utf-8')
    from System.IO import File
    temp=tempfile.NamedTemporaryFile(prefix='revit-lac-',suffix='.tmp',dir=os.path.dirname(path),delete=False)
    try:
        temp.write(payload);temp.close()
        if File.Exists(path):File.Replace(temp.name,path,None)
        else:File.Move(temp.name,path)
    finally:
        temp.close()
        if os.path.exists(temp.name):os.remove(temp.name)
    output=script.get_output()
    output.print_md('## Exportacao Revit para LAC')
    for kind,count in sorted(counts.items()):output.print_md('- {0}: {1}'.format(kind,count))
    for warning in data['warnings']:output.print_md('- Aviso: '+warning)
    forms.alert('JSON gerado: {0}\n{1} elementos, {2} ambientes, {3} cotas, {4} anotacoes e {5} vistas. {6} avisos de leitura. Arquivo de intercambio/analise; nao e backup LAC.'.format(path,len(data['elements']),counts.get('room',0),len(data['dimensions']),len(data['annotations']),len(data['views']),len(data['warnings'])))

if __name__=='__main__':
    try:main()
    except Exception as error:forms.alert('Exportacao cancelada: {0}'.format(error))
