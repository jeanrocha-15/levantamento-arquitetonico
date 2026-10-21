"""Lightweight model references. No RFA loading or family regeneration."""
import math
MARKER_APP='LAC.Dynamo.HydrantProposal.v1'


def is_hydrant_marker(element):
    return getattr(element,'ApplicationId',None)==MARKER_APP


def next_marker_label(used):
    index=1
    while 'H-P{:03d}'.format(index) in used:index+=1
    return 'H-P{:03d}'.format(index)


def marker_context(level,phase):
    return '{}|{}|'.format(level,phase)


def marker_matches(element,context,point):
    if not is_hydrant_marker(element) or not element.ApplicationDataId.startswith(context):return False
    box=element.get_BoundingBox(None)
    if box is None:return False
    centre=box.Transform.OfPoint(box.Min.Add(box.Max).Multiply(.5))
    # User-moved markers are compared at their current geometry location.
    return math.hypot(centre.X-point.X,centre.Y-point.Y)<=.5/FT


def create_hydrant_marker(point,label,context,phase_id):
    from System.Collections.Generic import List
    half=.08/FT
    # A small square post crosses the usual plan cut plane. Its dimensions
    # are merely graphical references, never actual hydrant dimensions.
    base=DB.XYZ(point.X,point.Y,point.Z+.02/FT)
    corners=[base.Add(DB.XYZ(x*half,y*half,0)) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    loop=DB.CurveLoop()
    for a,b in zip(corners,corners[1:]+corners[:1]):loop.Append(DB.Line.CreateBound(a,b))
    loops=List[DB.CurveLoop]();loops.Add(loop)
    solid=DB.GeometryCreationUtilities.CreateExtrusionGeometry(loops,DB.XYZ.BasisZ,1.5/FT)
    geometry=List[DB.GeometryObject]();geometry.Add(solid)
    element=DB.DirectShape.CreateElement(doc,DB.ElementId(DB.BuiltInCategory.OST_GenericModel))
    element.ApplicationId=MARKER_APP;element.ApplicationDataId=context+label
    element.Name=label+' · Hidrante proposto LAC'
    element.SetShape(geometry)
    if element.ArePhasesModifiable() and phase_id!=DB.ElementId.InvalidElementId:
        element.CreatedPhaseId=phase_id
    for parameter,value in [(DB.BuiltInParameter.ALL_MODEL_MARK,label),
            (DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS,'Posição sugerida de hidrante. Marcador genérico de estudo; revisar e posicionar a família definitiva. Não representa equipamento instalado.')]:
        p=element.get_Parameter(parameter)
        if p and not p.IsReadOnly:p.Set(value)
    # Per-element graphics: a visible blue reference, without new materials.
    graphics=DB.OverrideGraphicSettings()
    color=DB.Color(0,135,255)
    graphics.SetProjectionLineColor(color);graphics.SetCutLineColor(color)
    graphics.SetProjectionLineWeight(5);graphics.SetCutLineWeight(5)
    doc.ActiveView.SetElementOverrides(element.Id,graphics)
    return element


def insert_hydrant_markers(result,level,z,summary):
    if WF.MessageBox.Show(summary+'\n\nCriar marcadores genéricos leves no Revit? Não exige família de hidrante.',
            'Marcar posições propostas',WF.MessageBoxButtons.OKCancel)!=WF.DialogResult.OK:return result
    markers=[element for element in DB.FilteredElementCollector(doc).OfClass(DB.DirectShape) if is_hydrant_marker(element)]
    phase_parameter=view.get_Parameter(DB.BuiltInParameter.VIEW_PHASE)
    phase_id=phase_parameter.AsElementId() if phase_parameter else DB.ElementId.InvalidElementId
    context=marker_context(level.UniqueId,phase_id.Value)
    used={element.ApplicationDataId.rsplit('|',1)[-1] for element in markers}
    result['marcadores_existentes']=[];result['identificações_criadas']=[]
    transaction=DB.Transaction(doc,'LAC · Dynamo · Marcadores de hidrante');transaction.Start()
    try:
        for x,y in result['posições_m']:
            point=DB.XYZ(x/FT,y/FT,z)
            existing=next((element for element in markers if marker_matches(element,context,point)),None)
            if existing is not None:
                result['marcadores_existentes'].append(int(existing.Id.Value));continue
            label=next_marker_label(used)
            element=create_hydrant_marker(point,label,context,phase_id)
            markers.append(element);used.add(label)
            result['elementos_criados'].append(int(element.Id.Value));result['identificações_criadas'].append(label)
        if transaction.Commit()!=DB.TransactionStatus.Committed:raise ValueError('Revit não confirmou os marcadores.')
    except Exception:
        if transaction.GetStatus()==DB.TransactionStatus.Started:transaction.RollBack()
        raise
    finally:transaction.Dispose()
    result['modo']='Marcadores genéricos leves; sem família de hidrante'
    finish('{} marcadores criados; {} já existentes. Categoria: Modelos genéricos.\nIdentificação H-P001, H-P002… nos parâmetros Marca e Nome. Use as posições como referência para colocar as famílias definitivas.'.format(len(result['elementos_criados']),len(result['marcadores_existentes'])))
    return result
