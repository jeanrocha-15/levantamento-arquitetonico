"""Planar layout proposal. Not a hydraulic design or regulatory certification."""
def hydrant_main():
    sources=source_options()
    initial=configure('Hidrantes · origem do layout',[
        ('source','Modelo arquitetônico',list(sources),'Projeto atual'),
        ('reach','Alcance máximo por caminhamento (m)',None,'30'),
        ('step','Resolução da análise (m) — menor = mais detalhado',None,'0,25'),
        ('furniture','Considerar móveis e equipamentos como obstáculos',['Sim','Não'],'Sim'),
    ])
    link=sources[initial['source']];source=link.GetLinkDocument() if link else doc
    transform=link.GetTotalTransform() if link else DB.Transform.Identity
    reach=number(initial['reach'],1,60);step=number(initial['step'],.1,.5)
    phases={'{} [{}]'.format(name_of(p),p.Id.Value):p for p in source.Phases}
    config=configure('Hidrantes · pavimento e fase',[
        ('phase','Fase arquitetônica a analisar',list(phases),list(phases)[-1]),
        ('review','Resultado',['Marcadores genéricos leves no Revit','Somente proposta (sem criar elementos)','Proposta e inserir família após confirmação'],'Marcadores genéricos leves no Revit'),
    ])
    phase=phases[config['phase']];level=view.GenLevel;z=level.ProjectElevation
    rooms=[];regions=[];holes=[];warnings=[];ignored=[]
    # Rooms are selected by source phase and transformed elevation, not host IDs.
    options=DB.SpatialElementBoundaryOptions()
    for room in DB.FilteredElementCollector(source).OfCategory(DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType():
        try:
            if room.Area<=0 or room.Location is None or room.Phase.Id!=phase.Id:continue
            if abs(transform.OfPoint(room.Location.Point).Z-z)>.5/FT:continue
            loops=room.GetBoundarySegments(options)
            if not loops:ignored.append(int(room.Id.Value));continue
            polygons=[]
            for loop in loops:
                points=[]
                for segment in loop:
                    points.extend([(transform.OfPoint(p).X*FT,transform.OfPoint(p).Y*FT) for p in list(segment.GetCurve().Tessellate())[:-1]])
                if len(points)>=3:polygons.append(points)
            # Revit's first loop is normally external; use largest area explicitly.
            polygons.sort(key=lambda poly:abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1]))),reverse=True)
            if polygons and view.CropBoxActive:
                crop=view.CropBox
                for x,y in polygons[0]:
                    p=crop.Transform.Inverse.OfPoint(DB.XYZ(x/FT,y/FT,z))
                    if not (crop.Min.X<=p.X<=crop.Max.X and crop.Min.Y<=p.Y<=crop.Max.Y):
                        raise ValueError('ambiente cortado/fora do recorte da planta; desative o recorte para analisar o pavimento inteiro')
            if polygons:regions.append(polygons[0]);holes.extend(polygons[1:]);rooms.append(room)
        except Exception as error:
            ignored.append(int(room.Id.Value));warnings.append('Ambiente {}: {}'.format(room.Id.Value,error))
    options.Dispose()
    if not regions:raise ValueError('Nenhum ambiente delimitado na fase/pavimento escolhidos. Crie/confira os ambientes no arquitetônico.')
    def point2(p):
        p=transform.OfPoint(p);return p.X*FT,p.Y*FT
    def box_polygon(element):
        if is_hydrant_marker(element):return None
        box=element.get_BoundingBox(None)
        if box is None:return None
        corners=[transform.OfPoint(box.Transform.OfPoint(DB.XYZ(x,y,v))) for x in (box.Min.X,box.Max.X) for y in (box.Min.Y,box.Max.Y) for v in (box.Min.Z,box.Max.Z)]
        if max(p.Z for p in corners)<z+.15/FT or min(p.Z for p in corners)>z+1.5/FT:return None
        # Rotated boxes are deliberately conservative in the host XY plane.
        a,b,c,d=min(p.X for p in corners)*FT,min(p.Y for p in corners)*FT,max(p.X for p in corners)*FT,max(p.Y for p in corners)*FT
        return [(a,b),(c,b),(c,d),(a,d)]
    doors=collect(source,link,category=DB.BuiltInCategory.OST_Doors)
    walls=collect(source,link,klass=DB.Wall)
    obstacles=list(holes);candidates=[];wall_positions=[]
    def width_of(door):
        for element in (door,source.GetElement(door.GetTypeId())):
            p=element.get_Parameter(DB.BuiltInParameter.DOOR_WIDTH) if element else None
            if p and p.AsDouble()>0:return p.AsDouble()*FT
        return None
    for wall in walls:
        try:
            curve=wall.Location.Curve
            if not isinstance(curve,DB.Line):
                poly=box_polygon(wall)
                if poly:obstacles.append(poly)
                warnings.append('Parede curva {}: caixa conservadora; não recebe hidrante.'.format(wall.Id.Value));continue
            box=wall.get_BoundingBox(None)
            if box is None:continue
            low=transform.OfPoint(box.Transform.OfPoint(box.Min)).Z;high=transform.OfPoint(box.Transform.OfPoint(box.Max)).Z
            if max(low,high)<z+.15/FT or min(low,high)>z+1.5/FT:continue
            a,b=point2(curve.GetEndPoint(0)),point2(curve.GetEndPoint(1))
            length=math.dist(a,b)
            if length<.01:continue
            d=((b[0]-a[0])/length,(b[1]-a[1])/length);n=(-d[1],d[0]);half=wall.Width*FT/2
            side_offsets=[]
            for shell in (DB.ShellLayerType.Interior,DB.ShellLayerType.Exterior):
                offsets=[]
                for reference in DB.HostObjectUtils.GetSideFaces(wall,shell):
                    face=wall.GetGeometryObjectFromReference(reference)
                    if isinstance(face,DB.PlanarFace):
                        pos=point2(face.Origin);offsets.append((pos[0]-a[0])*n[0]+(pos[1]-a[1])*n[1])
                if offsets:side_offsets.extend(offsets)
            if len(side_offsets)<2:raise ValueError('sem faces laterais suficientes para definir a espessura real')
            wall_lo,wall_hi=min(side_offsets),max(side_offsets)
            def rect(lo,hi,low,high):
                return [(a[0]+d[0]*t+n[0]*s,a[1]+d[1]*t+n[1]*s) for t,s in [(lo,low),(hi,low),(hi,high),(lo,high)]]
            cuts=[]
            for door in doors:
                if door.Host is None or door.Host.Id!=wall.Id or not isinstance(door.Location,DB.LocationPoint):continue
                width=width_of(door)
                if width is None:
                    warnings.append('Porta {} sem largura: passagem bloqueada.'.format(door.Id.Value));continue
                # An instance at another level must never open this wall in plan.
                door_level=source.GetElement(door.LevelId)
                if door_level is None or abs(transform.OfPoint(DB.XYZ(0,0,door_level.ProjectElevation)).Z-z)>.5/FT:continue
                pos=point2(door.Location.Point);t=(pos[0]-a[0])*d[0]+(pos[1]-a[1])*d[1]
                lo,hi=max(0,t-width/2),min(length,t+width/2)
                if hi<=lo:continue
                cuts.append((lo,hi));regions.append(rect(lo,hi,wall_lo-step*2,wall_hi+step*2))
            cuts.sort();cursor=0.;solid=[]
            for lo,hi in cuts:
                if lo>cursor:solid.append((cursor,lo))
                cursor=max(cursor,hi)
            if cursor<length:solid.append((cursor,length))
            for lo,hi in solid:
                obstacles.append(rect(lo,hi,wall_lo,wall_hi))
                count=max(1,int((hi-lo)/3))
                for k in range(count):
                    t=lo+(hi-lo)*(k+.5)/count
                    for sign,boundary in ((-1,wall_lo),(1,wall_hi)):
                        distance=boundary+sign*step*1.5
                        p=(a[0]+d[0]*t+n[0]*distance,a[1]+d[1]*t+n[1]*distance)
                        wall_positions.append((p,wall,DB.XYZ(n[0]*sign,n[1]*sign,0)))
        except Exception as error:
            raise ValueError('Não foi possível ler a parede {}. Análise interrompida para não ignorar obstáculo: {}'.format(wall.Id.Value,error))
    categories=[DB.BuiltInCategory.OST_Columns,DB.BuiltInCategory.OST_StructuralColumns,DB.BuiltInCategory.OST_GenericModel]
    if initial['furniture']=='Sim':categories.extend([DB.BuiltInCategory.OST_Furniture,DB.BuiltInCategory.OST_SpecialityEquipment,DB.BuiltInCategory.OST_PlumbingFixtures,DB.BuiltInCategory.OST_MechanicalEquipment])
    for category in categories:
        for element in collect(source,link,category=category):
            poly=box_polygon(element)
            if poly:obstacles.append(poly)
    # Also consider PPCI host obstacles when the architecture is linked.
    if link:
        saved=transform;transform=DB.Transform.Identity
        for category in categories+[DB.BuiltInCategory.OST_Walls]:
            for element in collect(doc,None,category=category):
                poly=box_polygon(element)
                if poly:obstacles.append(poly)
        transform=saved
    if ignored:warnings.append('{} ambientes não puderam ser delimitados.'.format(len(ignored)))
    grid=make_grid(regions,obstacles,step,max_cells=60000)
    finish('Clique no lado interno da entrada principal. A proposta considera os ambientes da fase escolhida e os obstáculos visíveis da planta. Elementos ocultos e áreas sem ambientes precisam de revisão.')
    entrance=uidoc.Selection.PickPoint('Clique no lado interno da entrada principal')
    entry=nearest(grid,(entrance.X*FT,entrance.Y*FT),max_distance=step*2)
    for p,wall,n in wall_positions:
        try:
            cell=nearest(grid,p,max_distance=step*.72)
            if cell not in [item[0] for item in candidates]:candidates.append((cell,wall,n))
        except ValueError:pass
    # Deterministic spread over the layout; never silently reduce resolution.
    if len(candidates)>80:raise ValueError('Mais de 80 posições candidatas: restrinja a vista/ambientes antes de executar.')
    status=WF.Form();status.Text='Calculando cobertura · feche para cancelar';status.Size=Size(460,110);status.TopMost=True
    label=WF.Label();label.Size=Size(430,45);label.Location=Point(10,10);status.Controls.Add(label);status.Show()
    def progress(index,total):
        if status.IsDisposed:raise OperationCanceledException()
        label.Text='Posição {}/{} — calculando percursos no layout'.format(index+1,total)
        WF.Application.DoEvents()
    reserve=step*2.3+max([wall.Width*FT for wall in walls] or [0])
    try:result=distribute(grid,entry,[item[0] for item in candidates],reach,progress=progress,reserve=reserve)
    finally:
        if not status.IsDisposed:status.Close();status.Dispose()
    bycell={cell:(wall,n) for cell,wall,n in candidates}
    result['avisos']=warnings
    result['posições_m']=[coordinate(grid,c) for c in result['positions']]
    result['rotas_m']=[[coordinate(grid,c) for c in route] for route in result['routes']]
    result['limite_m']=reach;result['resolução_m']=step;result['fase']=config['phase'];result['elementos_criados']=[]
    result['projeto']=doc.Title;result['endereço_projeto']=doc.ProjectInformation.Address
    result['reserva_instalação_m']=reserve
    result['uncovered']=sorted(result['uncovered']);result['disconnected']=sorted(result['disconnected'])
    result['faixas_de_borda']='Faixas menores que a resolução e células junto aos obstáculos não são certificadas por esta amostragem; revisar na planta.'
    summary='{} hidrantes sugeridos; {} células sem cobertura; {} células sem conexão com a entrada.\nResolução: {} m. Revisar faixas de borda e passagens estreitas descartadas na grade.\nProposta geométrica; não verifica vazão, pressão, tubulação, simultaneidade ou aprovação normativa.'.format(len(result['positions']),len(result['uncovered']),len(result['disconnected']),step)
    # Dynamo preview, using the same coordinate units conversion as Revit geometry.
    clr.AddReference('RevitNodes');import Revit
    clr.AddReference('ProtoGeometry')
    from Autodesk.DesignScript.Geometry import Line as DSLine
    clr.ImportExtensions(Revit.GeometryConversion)
    preview_points=[DB.XYZ(x/FT,y/FT,z).ToPoint() for x,y in result['posições_m']]
    result['prévia_pontos']=preview_points
    route_points=[[DB.XYZ(x/FT,y/FT,z).ToPoint() for x,y in route] for route in result['rotas_m']]
    result['prévia_rotas']=[[DSLine.ByStartPointEndPoint(a,b) for a,b in zip(points,points[1:])] for points in route_points]
    if config['review']=='Somente proposta (sem criar elementos)':
        finish(summary+'\nConsulte a prévia e a saída do nó.');return result
    if result['uncovered'] or result['disconnected'] or ignored:
        finish(summary+'\nInserção bloqueada: confira áreas não atendidas/ambientes não lidos.');return result
    if config['review']=='Marcadores genéricos leves no Revit':
        return insert_hydrant_markers(result,level,z,summary)
    types={}
    for symbol in DB.FilteredElementCollector(doc).OfClass(DB.FamilySymbol):
        # User chooses the actual loaded hydrant type; no guessed family names.
        if symbol.Family.FamilyPlacementType in (DB.FamilyPlacementType.OneLevelBased,DB.FamilyPlacementType.OneLevelBasedHosted):
            if not link or symbol.Family.FamilyPlacementType==DB.FamilyPlacementType.OneLevelBased:
                types['{} · {} [{}]'.format(symbol.FamilyName,name_of(symbol),symbol.Id.Value)]=symbol
    if not types:raise ValueError('Carregue uma família de hidrante baseada em nível. No modelo próprio também são aceitas famílias hospedadas em parede. Famílias de face exigem adaptação específica.')
    placement=configure('Inserir proposta revisada',[
        ('type','Tipo de hidrante carregado no projeto',list(types),list(types)[0]),
        ('height','Altura de inserção acima do nível (m)',None,'1,20'),
    ])
    height=number(placement['height'],0,3);symbol=types[placement['type']]
    if WF.MessageBox.Show(summary+'\n\nConfirma inserir a proposta revisada com o tipo escolhido?', 'Inserir hidrantes',WF.MessageBoxButtons.OKCancel)!=WF.DialogResult.OK:return result
    existing=list(DB.FilteredElementCollector(doc).OfClass(DB.FamilyInstance).WhereElementIsNotElementType())
    group=DB.TransactionGroup(doc,'LAC · Dynamo · Hidrantes');group.Start()
    try:
        tx=DB.Transaction(doc,'Inserir hidrantes');tx.Start()
        try:
            if not symbol.IsActive:symbol.Activate();doc.Regenerate()
            for cell in result['positions']:
                x,y=coordinate(grid,cell);point=DB.XYZ(x/FT,y/FT,z+height/FT)
                wall,n=bycell[cell]
                if symbol.Family.FamilyPlacementType==DB.FamilyPlacementType.OneLevelBasedHosted:
                    # Move the preview point to the actual host axis; do not host on a linked wall.
                    local=wall.Location.Curve.Project(DB.XYZ(point.X,point.Y,wall.Location.Curve.GetEndPoint(0).Z))
                    if local is None:raise ValueError('Não foi possível projetar hidrante no hospedeiro.')
                    point=DB.XYZ(local.XYZPoint.X,local.XYZPoint.Y,point.Z)
                    if any(e.GetTypeId()==symbol.Id and isinstance(e.Location,DB.LocationPoint) and e.Location.Point.DistanceTo(point)<.5/FT for e in existing):continue
                    instance=doc.Create.NewFamilyInstance(point,symbol,wall,level,DB.Structure.StructuralType.NonStructural)
                else:
                    if any(e.GetTypeId()==symbol.Id and isinstance(e.Location,DB.LocationPoint) and e.Location.Point.DistanceTo(point)<.5/FT for e in existing):continue
                    instance=doc.Create.NewFamilyInstance(point,symbol,level,DB.Structure.StructuralType.NonStructural)
                facing=instance.FacingOrientation
                angle=math.atan2(facing.X*n.Y-facing.Y*n.X,facing.X*n.X+facing.Y*n.Y)
                DB.ElementTransformUtils.RotateElement(doc,instance.Id,DB.Line.CreateBound(point,point.Add(DB.XYZ.BasisZ)),angle)
                existing.append(instance);result['elementos_criados'].append(int(instance.Id.Value))
            if tx.Commit()!=DB.TransactionStatus.Committed:raise ValueError('Revit não confirmou a inserção.')
        except Exception:
            if tx.GetStatus()==DB.TransactionStatus.Started:tx.RollBack()
            raise
        finally:tx.Dispose()
        if group.Assimilate()!=DB.TransactionStatus.Committed:raise ValueError('Grupo de inserção não confirmado.')
    except Exception:
        if group.GetStatus()==DB.TransactionStatus.Started:group.RollBack()
        raise
    finally:group.Dispose()
    finish(summary+'\n{} instâncias criadas.'.format(len(result['elementos_criados'])))
    return result


OUT=guarded(hydrant_main) if IN[0] else 'Ative Executar e clique Executar no modo Manual.'
