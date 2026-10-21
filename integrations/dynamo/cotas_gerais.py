"""General and chained native dimensions, using LAC's existing reference search."""
def dimension_main():
    sources=source_options()
    dimension_types={'Padrão do Revit':None}
    for kind in DB.FilteredElementCollector(doc).OfClass(DB.DimensionType):
        if kind.StyleType==DB.DimensionStyleType.Linear:
            dimension_types['{} [{}]'.format(name_of(kind),kind.Id.Value)]=kind
    config=configure('Cotas gerais automáticas',[
        ('source','Origem das paredes',list(sources),'Projeto atual'),
        ('scope','Paredes a cotar',['Todas as paredes visíveis','Selecionar paredes'],'Todas as paredes visíveis'),
        ('mode','Composição',['Todas as paredes','Externas + trechos principais'],'Todas as paredes'),
        ('minimum','Trecho principal mínimo (m), para a segunda opção',None,'1,00'),
        ('style','Tipo de cota',list(dimension_types),'Padrão do Revit'),
        ('offset','Afastamento no papel (mm)',None,'8'),
    ])
    link=sources[config['source']];source=link.GetLinkDocument() if link else doc
    transform=link.GetTotalTransform() if link else DB.Transform.Identity
    walls=collect(source,link,klass=DB.Wall)
    if config['scope']=='Selecionar paredes':
        references=uidoc.Selection.PickObjects(ObjectType.LinkedElement if link else ObjectType.Element,'Selecione as paredes e conclua a seleção')
        selected={int(r.LinkedElementId.Value if link else r.ElementId.Value) for r in references if not link or r.ElementId==link.Id}
        walls=[w for w in walls if int(w.Id.Value) in selected]
    if len(walls)<2:raise ValueError('Selecione pelo menos duas paredes visíveis da origem escolhida.')
    offset=number(config['offset'],3,50)/1000*view.Scale/FT
    minimum_run=number(config['minimum'],.1,50)/FT
    dimension_type=dimension_types[config['style']]
    warnings=[];directions={};points=[];geometries=[]
    class LocalView:
        native_view=None
        def __init__(self):
            inverse=transform.Inverse
            self.Origin=inverse.OfPoint(view.Origin)
            self.ViewDirection=inverse.OfVector(view.ViewDirection).Normalize()
            self.RightDirection=inverse.OfVector(view.RightDirection).Normalize()
            self.UpDirection=inverse.OfVector(view.UpDirection).Normalize()
    local=LocalView() if link else view
    for wall in walls:
        try:
            curve=wall.Location.Curve
            if not isinstance(curve,DB.Line):raise ValueError('parede curva não suportada')
            a,b=[transform.OfPoint(curve.GetEndPoint(i)) for i in (0,1)]
            delta=b.Subtract(a).Normalize()
            if abs(delta.Z)>.000001:raise ValueError('eixo fora do plano da planta')
            angle=math.atan2(delta.DotProduct(view.UpDirection),delta.DotProduct(view.RightDirection))%math.pi
            key=round(angle,7)
            directions[key]=view.RightDirection.Multiply(math.cos(angle)).Add(view.UpDirection.Multiply(math.sin(angle)))
            points.extend([a,b])
            faces=faces_of(wall,local)
            geometries.append((wall,curve,faces))
        except Exception as error:warnings.append('Parede {}: {}'.format(wall.Id.Value,error))
    if not geometries:raise ValueError('Nenhuma parede reta referenciável.')
    existing=set()
    for dim in DB.FilteredElementCollector(doc,view.Id).OfClass(DB.Dimension):
        try:existing.add(reference_key(doc,list(dim.References)))
        except Exception:pass
    group=DB.TransactionGroup(doc,'LAC · Dynamo · Cotas gerais');group.Start()
    created=[];skipped=0
    try:
        if config['mode']=='Todas as paredes':
            centre=DB.XYZ(sum(p.X for p in points)/len(points),sum(p.Y for p in points)/len(points),sum(p.Z for p in points)/len(points))
            occupied=[]
            for wall,curve,faces in geometries:
                footprint=wall_footprint(wall,local)
                if footprint:
                    world=[]
                    for x,y in footprint:
                        p=local.RightDirection.Multiply(x).Add(local.UpDirection.Multiply(y))
                        p=transform.OfPoint(p)
                        world.append((p.DotProduct(view.RightDirection),p.DotProduct(view.UpDirection)))
                    occupied.append(world)
            for dim in DB.FilteredElementCollector(doc,view.Id).OfClass(DB.Dimension):
                box=dim.get_BoundingBox(view)
                if box:occupied.append(polygon_of_box(box_rectangle(box,view)))
            for wall,curve,faces in geometries:
                try:specs,errors=dimension_specs(wall,local,'Comprimento',offset)
                except Exception as error:
                    warnings.append('Parede {}: {}'.format(wall.Id.Value,error));continue
                warnings.extend('Parede {}: {}'.format(wall.Id.Value,e) for e in errors)
                accepted=False
                for kind,refs,p,q,away,distance in specs:
                    try:
                        if link:refs=[r.CreateLinkReference(link) for r in refs]
                        key=reference_key(doc,refs)
                    except Exception:continue
                    if key in existing:skipped+=1;accepted=True;break
                    p=project_to_view(transform.OfPoint(p),view);q=project_to_view(transform.OfPoint(q),view)
                    away=transform.OfVector(away).Normalize()
                    if away.DotProduct(p.Add(q).Multiply(.5).Subtract(centre))<0:away=away.Negate()
                    for lane in range(8):
                        shift=away.Multiply(distance+lane*offset)
                        a,b=p.Add(shift),q.Add(shift)
                        if not within_crop(a,b):continue
                        area=polygon_of_box(rectangle([a,b],view,offset*.25))
                        if any(overlaps(area,box) for box in occupied):continue
                        tx=DB.Transaction(doc,'Cota associativa de parede');tx.Start()
                        try:
                            array=DB.ReferenceArray()
                            for ref in refs:array.Append(ref)
                            line=DB.Line.CreateBound(a,b)
                            dim=doc.Create.NewDimension(view,line,array,dimension_type) if dimension_type else doc.Create.NewDimension(view,line,array)
                            doc.Regenerate()
                            if dim is None or not dim.AreReferencesAvailable or dim.Value is None or abs(dim.Value-p.DistanceTo(q))>.001/FT:
                                raise ValueError('Referência não mede o comprimento proposto.')
                            if tx.Commit()!=DB.TransactionStatus.Committed:raise ValueError('Transação não confirmada.')
                            created.append(int(dim.Id.Value));existing.add(key);occupied.append(area);accepted=True;break
                        except Exception:
                            if tx.GetStatus()==DB.TransactionStatus.Started:tx.RollBack()
                        finally:tx.Dispose()
                    if accepted:break
                if not accepted:warnings.append('Parede {}: sem referências aceitas ou sem espaço livre nas 8 faixas próximas.'.format(wall.Id.Value))
            directions={}
        for angle,direction in sorted(directions.items()):
            normal=view.ViewDirection.CrossProduct(direction).Normalize();candidates=[]
            def add(ref,point,priority):
                try:
                    if ref is None:return
                    converted=ref.CreateLinkReference(link) if link else ref
                    converted.ConvertToStableRepresentation(doc)
                    world=transform.OfPoint(point)
                    candidates.append((world.DotProduct(direction),priority,converted))
                except Exception:pass
            for wall,curve,faces in geometries:
                for face in faces:
                    if abs(transform.OfVector(face.FaceNormal).DotProduct(direction))>=ALIGNMENT:
                        add(face.Reference,face.Origin,0)
                axis=curve.GetEndPoint(1).Subtract(curve.GetEndPoint(0)).Normalize()
                if abs(transform.OfVector(axis).DotProduct(direction))>=ALIGNMENT:
                    alternatives=endpoint_candidates(wall,local,curve,curve.GetEndPoint(0),curve.GetEndPoint(1),axis,faces)
                    for refs,p,q in alternatives:
                        for ref,point in zip(refs,(p,q)):add(ref,point,1)
            candidates.sort(key=lambda item:(item[0],item[1]))
            stations=[]
            for item in candidates:
                if not stations or abs(item[0]-stations[-1][0][0])>.001/FT:stations.append([item])
                else:stations[-1].append(item)
            if len(stations)<2:
                warnings.append('Direção {:.1f}°: sem duas referências externas válidas.'.format(math.degrees(angle)));continue
            # Retain both extrema; intermediate stations only at meaningful spacing.
            major=[stations[0]]
            for station in stations[1:-1]:
                if station[0][0]-major[-1][0][0]>=minimum_run and stations[-1][0][0]-station[0][0]>=minimum_run:
                    major.append(station)
            stations=major+[stations[-1]]
            minimum=min(p.DotProduct(normal) for p in points)-max(w.Width for w,_,_ in geometries)/2
            # Separate lanes outside the entire selected assembly.
            modes=['encadeada','geral'] if len(stations)>2 else ['geral']
            for lane,mode in enumerate(modes):
                selected_stations=stations if mode=='encadeada' else [stations[0],stations[-1]]
                success=False;failures=[]
                for attempt in range(6):
                    chosen=[station[min(attempt,len(station)-1)] for station in selected_stations]
                    refs=[s[2] for s in chosen];key=reference_key(doc,refs)
                    if key in existing:skipped+=1;success=True;break
                    p=view.Origin.Add(direction.Multiply(chosen[0][0]-view.Origin.DotProduct(direction))).Add(normal.Multiply(minimum-view.Origin.DotProduct(normal)-(lane+1)*offset))
                    q=p.Add(direction.Multiply(chosen[-1][0]-chosen[0][0]))
                    if not within_crop(p,q):
                        failures.append('cota fora do recorte; amplie/desative o recorte da planta');continue
                    tx=DB.Transaction(doc,'Cota geral associativa');tx.Start()
                    try:
                        array=DB.ReferenceArray()
                        for ref in refs:array.Append(ref)
                        line=DB.Line.CreateBound(p,q)
                        dim=doc.Create.NewDimension(view,line,array,dimension_type) if dimension_type else doc.Create.NewDimension(view,line,array)
                        doc.Regenerate()
                        if dim is None or not dim.AreReferencesAvailable:raise ValueError('referências rejeitadas')
                        measured=sum(seg.Value for seg in dim.Segments) if dim.NumberOfSegments>0 else dim.Value
                        if measured is None or abs(measured-(chosen[-1][0]-chosen[0][0]))>.001/FT:
                            raise ValueError('medida das referências difere da extensão geométrica')
                        if tx.Commit()!=DB.TransactionStatus.Committed:raise ValueError('transação não confirmada')
                        created.append(int(dim.Id.Value));existing.add(key);success=True;break
                    except Exception as error:
                        if tx.GetStatus()==DB.TransactionStatus.Started:tx.RollBack()
                        failures.append(str(error))
                    finally:tx.Dispose()
                if not success:warnings.append('{:.1f}° / {}: {}'.format(math.degrees(angle),mode,'; '.join(sorted(set(failures)))))
        if group.Assimilate()!=DB.TransactionStatus.Committed:raise ValueError('Grupo de cotas não confirmado.')
    except Exception:
        if group.GetStatus()==DB.TransactionStatus.Started:group.RollBack()
        raise
    finally:group.Dispose()
    result={'cotas_criadas':created,'já_existentes':skipped,'avisos':warnings,'origem':config['source']}
    finish('{} cotas criadas; {} existentes; {} avisos. Detalhes na saída do nó.'.format(len(created),skipped,len(warnings)))
    return result


OUT=guarded(dimension_main) if IN[0] else 'Ative Executar e clique Executar no modo Manual.'
