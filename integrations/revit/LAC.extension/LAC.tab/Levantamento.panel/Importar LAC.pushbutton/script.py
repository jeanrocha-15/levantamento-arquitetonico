# -*- coding: utf-8 -*-
"""LAC exchange v1. Runs inside pyRevit; never in the web browser."""
import json
import math
import os
import hashlib
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
    update_mode = bool(globals().get('LAC_UPDATE', False))
    config = script.get_config('LAC_file_sources')
    document_key = doc.ProjectInformation.UniqueId
    sources = config.get_option('sources', {})
    saved = sources.get(document_key, {})
    path = saved.get('path') if update_mode else None
    while True:
        if not path:
            path = forms.pick_file(file_ext='json', title='Escolher arquivo LAC (caminho será lembrado)')
            if not path:
                return
        try:
            with open(path, 'rb') as stream:
                data = json.loads(stream.read().decode('utf-8-sig'))
            validate(data)
            # Compare model data, not file timestamps or formatting.
            model_data = {key: data.get(key) for key in ('schemaVersion', 'units', 'project', 'floor', 'walls', 'openings')}
            fingerprint = hashlib.sha256(json.dumps(model_data, sort_keys=True, ensure_ascii=True).encode('utf-8')).hexdigest()
            if update_mode and saved.get('fingerprint') == fingerprint:
                reason = 'Não há alterações no modelo desde a última importação bem-sucedida.\n' + path
            else:
                break
        except (IOError, OSError, ValueError, KeyError, TypeError) as error:
            reason = 'Arquivo não encontrado ou inválido:\n{0}\n{1}'.format(path, error)
        choice = forms.CommandSwitchWindow.show(['Escolher outro arquivo', 'Cancelar'], message=reason)
        if choice != 'Escolher outro arquivo':
            return
        path = None
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
    existing = {}
    for wall in DB.FilteredElementCollector(doc).OfClass(DB.Wall):
        parameter = wall.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
        if parameter:
            existing[parameter.AsString()] = wall
    incoming = [(w, marker_prefix + w['roomId'] + ':' + w['id']) for w in data['walls']]
    incoming = [(w, key) for w, key in incoming if update_mode or key not in existing]
    if not incoming:
        forms.alert('Estas paredes já foram importadas. A atualização de paredes existentes ainda não é automática.')
        return
    if not forms.alert('Processar {0} paredes (atualizar existentes e adicionar novas)? As aberturas serão recortes retangulares, sem famílias de portas/janelas. Use um projeto limpo para substituir a importação antiga.'.format(len(incoming)), yes=True, no=True):
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
            element = existing.get(key) if update_mode else None
            if element:
                if element.Pinned:
                    raise ValueError('Parede travada no Revit: ' + wall['label'])
                element.ChangeTypeId(mapping[wall['_typeName']].Id)
                element.get_Parameter(DB.BuiltInParameter.WALL_BASE_CONSTRAINT).Set(level.Id)
                element.get_Parameter(DB.BuiltInParameter.WALL_BASE_OFFSET).Set(0.0)
                element.Location.Curve = DB.Line.CreateBound(a, b)
                element.get_Parameter(DB.BuiltInParameter.WALL_HEIGHT_TYPE).Set(DB.ElementId.InvalidElementId)
                element.get_Parameter(DB.BuiltInParameter.WALL_USER_HEIGHT_PARAM).Set(wall['heightM'] / METERS_PER_FOOT)
            else:
                element = DB.Wall.Create(doc, DB.Line.CreateBound(a, b), mapping[wall['_typeName']].Id, level.Id, wall['heightM'] / METERS_PER_FOOT, 0, False, False)
            element.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS).Set(key)
            hosts[wall['id']] = element
        doc.Regenerate()
        old_cuts = {}
        for cut in DB.FilteredElementCollector(doc).OfClass(DB.Opening):
            param = cut.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
            if param:
                old_cuts[param.AsString()] = cut
        for opening in data.get('openings', []):
            host = hosts.get(opening['hostWallId'])
            if not host:
                continue
            cut_key = marker_prefix + 'opening:' + opening['roomId'] + ':' + opening['id']
            old_cut = old_cuts.get(cut_key)
            if old_cut:
                if not update_mode:
                    continue
                doc.Delete(old_cut.Id)
            # Upgrade legacy cuts only when hosted on the exact LAC wall and same label.
            legacy = old_cuts.get('LAC abertura: ' + opening['label'])
            if update_mode and legacy and legacy.Host.Id == host.Id:
                doc.Delete(legacy.Id)
            cut = doc.Create.NewOpening(host, xyz(opening['start']), xyz(opening['end']))
            param = cut.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
            if param and not param.IsReadOnly:
                param.Set(cut_key)
    sources[document_key] = {'path': os.path.abspath(path), 'fingerprint': fingerprint}
    config.sources = sources
    script.save_config()
    forms.alert('{0} paredes processadas. Confira a vista 3D. Elementos ausentes no JSON não foram excluídos.'.format(len(incoming)))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        forms.alert('Importação cancelada: ' + str(error))
