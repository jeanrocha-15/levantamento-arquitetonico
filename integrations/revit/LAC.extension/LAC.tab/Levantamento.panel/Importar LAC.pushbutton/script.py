# -*- coding: utf-8 -*-
"""LAC exchange v1. Runs inside pyRevit; never in the web browser."""
import json
import math
from pyrevit import DB, forms, revit, script

METERS_PER_FOOT = 0.3048

def finite(value):
    return isinstance(value, (int, float)) and not math.isnan(value) and not math.isinf(value)

def validate(data):
    if data.get('format') != 'lac-revit' or data.get('schemaVersion') != 1 or data.get('units') != 'm':
        raise ValueError('Formato LAC/Revit incompatível.')
    if not data.get('walls'):
        raise ValueError('Arquivo sem paredes.')
    for wall in data['walls']:
        for key in ('start', 'end'):
            if len(wall[key]) != 3 or not all(finite(v) for v in wall[key]):
                raise ValueError('Coordenadas inválidas.')
        if not all(finite(wall[k]) and wall[k] > 0 for k in ('heightM', 'thicknessM')):
            raise ValueError('Altura/espessura inválida.')

def main():
    doc = revit.doc
    if doc.IsFamilyDocument:
        forms.alert('Abra um projeto Revit, não uma família.', exitscript=True)
    path = forms.pick_file(file_ext='json', title='Selecionar exportação LAC-Revit')
    if not path:
        return
    with open(path, 'rb') as stream:
        data = json.loads(stream.read().decode('utf-8-sig'))
    validate(data)
    wall_types = [t for t in DB.FilteredElementCollector(doc).OfClass(DB.WallType) if t.Kind == DB.WallKind.Basic]
    if not wall_types:
        forms.alert('O projeto precisa ter pelo menos um tipo de parede básica como referência.', exitscript=True)
    template_name = forms.SelectFromList.show(sorted(revit.query.get_name(t) for t in wall_types), title='Referência para criar tipos LAC (uma camada simplificada)', multiselect=False)
    if not template_name:
        return
    template = next(t for t in wall_types if revit.query.get_name(t) == template_name)
    mapping = {}
    type_specs = {}
    for wall in data['walls']:
        name = 'LAC - {0} - {1:g} mm'.format(wall.get('typeName') or 'Parede', wall['thicknessM'] * 1000)
        wall['_typeName'] = name
        type_specs[name] = wall['thicknessM']
    for name, width in type_specs.items():
        existing_type = next((t for t in wall_types if revit.query.get_name(t) == name), None)
        if existing_type:
            if abs(existing_type.Width * METERS_PER_FOOT - width) >= 0.0001:
                raise ValueError('Tipo LAC existente com espessura divergente: ' + name)
            mapping[name] = existing_type
    marker_prefix = 'LAC:{0}:{1}:'.format(data['project']['id'], data['floor']['id'])
    existing = set()
    for wall in DB.FilteredElementCollector(doc).OfClass(DB.Wall):
        parameter = wall.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
        if parameter:
            existing.add(parameter.AsString())
    incoming = [(w, marker_prefix + w['roomId'] + ':' + w['id']) for w in data['walls']]
    incoming = [(w, key) for w, key in incoming if key not in existing]
    if not incoming:
        forms.alert('Estas paredes já foram importadas. A atualização de paredes existentes ainda não é automática.')
        return
    if not forms.alert('Criar {0} paredes? As aberturas serão recortes retangulares, sem famílias de portas/janelas. Use um projeto limpo para substituir a importação antiga.'.format(len(incoming)), yes=True, no=True):
        return
    elevation = data['floor']['elevationM'] / METERS_PER_FOOT
    name = 'LAC - ' + data['floor']['name'] + ' - ' + data['floor']['id']
    levels = list(DB.FilteredElementCollector(doc).OfClass(DB.Level))
    level = next((l for l in levels if l.Name == name), None)
    if level and abs(level.Elevation - elevation) > 0.0001:
        raise ValueError('O nível LAC existente tem outra elevação. Confira no Revit antes de importar.')
    def xyz(point):
        return DB.XYZ(*[v / METERS_PER_FOOT for v in point])
    with revit.Transaction('Importar levantamento LAC'):
        from System.Collections.Generic import List
        for name, width in type_specs.items():
            if name in mapping:
                continue
            new_type = template.Duplicate(name)
            structure = template.GetCompoundStructure()
            material_id = DB.ElementId.InvalidElementId
            if structure and structure.LayerCount:
                material_id = structure.GetMaterialId(0)
            layers = List[DB.CompoundStructureLayer]()
            layers.Add(DB.CompoundStructureLayer(width / METERS_PER_FOOT, DB.MaterialFunctionAssignment.Structure, material_id))
            new_type.SetCompoundStructure(DB.CompoundStructure.CreateSimpleCompoundStructure(layers))
            mapping[name] = new_type
        if not level:
            level = DB.Level.Create(doc, elevation)
            level.Name = name
        hosts = {}
        for wall, key in incoming:
            a, b = xyz(wall['start']), xyz(wall['end'])
            if a.DistanceTo(b) <= doc.Application.ShortCurveTolerance:
                raise ValueError('Parede muito curta para o Revit: ' + wall['label'])
            element = DB.Wall.Create(doc, DB.Line.CreateBound(a, b), mapping[wall['_typeName']].Id, level.Id, wall['heightM'] / METERS_PER_FOOT, 0, False, False)
            element.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS).Set(key)
            hosts[wall['id']] = element
        for opening in data.get('openings', []):
            host = hosts.get(opening['hostWallId'])
            if not host:
                continue
            cut = doc.Create.NewOpening(host, xyz(opening['start']), xyz(opening['end']))
            param = cut.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
            if param and not param.IsReadOnly:
                param.Set('LAC abertura: ' + opening['label'])
    forms.alert('{0} paredes criadas. Confira o resultado em uma vista 3D.'.format(len(incoming)))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        forms.alert('Importação cancelada: ' + str(error))
