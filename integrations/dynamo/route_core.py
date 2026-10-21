"""Conservative, planar routing in metres. No Revit dependencies."""
import heapq
import math


def inside(point, polygon):
    x, y = point
    hit = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        cross = (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])
        if abs(cross) < 1e-9 and min(a[0], b[0])-1e-9 <= x <= max(a[0], b[0])+1e-9 and min(a[1], b[1])-1e-9 <= y <= max(a[1], b[1])+1e-9:
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            hit = not hit
    return hit


def segments_cross(a, b, c, d):
    def side(p, q, r):
        return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
    def on(p, q, r):
        return min(p[0],q[0])-1e-9 <= r[0] <= max(p[0],q[0])+1e-9 and min(p[1],q[1])-1e-9 <= r[1] <= max(p[1],q[1])+1e-9
    s, t, u, v = side(a,b,c), side(a,b,d), side(c,d,a), side(c,d,b)
    return (s*t < 0 and u*v < 0) or any(abs(k)<1e-9 and on(p,q,r) for k,p,q,r in [(s,a,b,c),(t,a,b,d),(u,c,d,a),(v,c,d,b)])


def polygons_touch(a, b):
    if inside(a[0], b) or inside(b[0], a):
        return True
    return any(segments_cross(p,q,r,s) for p,q in zip(a,a[1:]+a[:1]) for r,s in zip(b,b[1:]+b[:1]))


def bounds(poly):
    return min(p[0] for p in poly), min(p[1] for p in poly), max(p[0] for p in poly), max(p[1] for p in poly)


def make_grid(regions, obstacles, step=.25, max_cells=100000):
    """A cell is usable only when its entire square is inside the region union.

    Boundary intersection events partition every cell edge, so a thin obstacle
    cannot disappear between samples. Obstacles are conservatively rasterized.
    """
    if not regions or not .1 <= step <= 1:
        raise ValueError('Sem áreas de circulação ou resolução fora de 0,10–1,00 m.')
    all_points = [p for poly in regions for p in poly]
    box = bounds(all_points)
    origin = (math.floor(box[0]/step)*step, math.floor(box[1]/step)*step)
    nx, ny = int(math.ceil((box[2]-origin[0])/step)), int(math.ceil((box[3]-origin[1])/step))
    if nx*ny > max_cells:
        raise ValueError('Área muito grande: limite de {} células. Restrinja o pavimento/áreas.'.format(max_cells))
    index = {}
    for kind, polygons in [('r',regions),('o',obstacles)]:
        for poly in polygons:
            x0,y0,x1,y1=bounds(poly)
            for i in range(max(0,int(math.floor((x0-origin[0])/step))-1), min(nx,int(math.ceil((x1-origin[0])/step))+1)):
                for j in range(max(0,int(math.floor((y0-origin[1])/step))-1), min(ny,int(math.ceil((y1-origin[1])/step))+1)):
                    index.setdefault((i,j), {'r':[], 'o':[]})[kind].append(poly)
    cells = set()
    for cell, nearby in index.items():
        i,j=cell; x,y=origin[0]+i*step,origin[1]+j*step
        square=[(x,y),(x+step,y),(x+step,y+step),(x,y+step)]
        samples=square+[(x+step/2,y+step/2)]
        covered=bool(nearby['r']) and all(any(inside(p,poly) for poly in nearby['r']) for p in samples)
        if not covered or any(polygons_touch(square,poly) for poly in nearby['o']):
            continue
        # Cover each boundary interval; do not bridge gaps between rooms.
        for a,b in zip(square,square[1:]+square[:1]):
            ts=[0.,1.];dx,dy=b[0]-a[0],b[1]-a[1]
            for poly in nearby['r']:
                for c,d in zip(poly,poly[1:]+poly[:1]):
                    ex,ey=d[0]-c[0],d[1]-c[1];det=dx*ey-dy*ex
                    if abs(det)<1e-12:continue
                    t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/det
                    u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/det
                    if 0<t<1 and 0<=u<=1:ts.append(t)
            ts=sorted(ts)
            if any(not any(inside((a[0]+dx*(lo+hi)/2,a[1]+dy*(lo+hi)/2),poly) for poly in nearby['r']) for lo,hi in zip(ts,ts[1:])):
                covered=False;break
        if covered:cells.add(cell)
    return {'cells':cells,'origin':origin,'step':step}


def coordinate(grid, cell):
    return tuple(grid['origin'][k]+(cell[k]+.5)*grid['step'] for k in (0,1))


def nearest(grid, point, max_distance=1.):
    if not grid['cells']:raise ValueError('Nenhuma célula transitável.')
    cell=min(grid['cells'],key=lambda c:math.dist(coordinate(grid,c),point))
    if math.dist(coordinate(grid,cell),point)>max_distance:
        raise ValueError('Ponto fora da área transitável; selecione pelo lado interno da entrada.')
    return cell


def distances(grid, start, limit=float('inf')):
    costs={start:0.};parents={};queue=[(0.,start)]
    while queue:
        cost,cell=heapq.heappop(queue)
        if cost!=costs[cell]:continue
        for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)]:
            nxt=(cell[0]+dx,cell[1]+dy)
            if nxt not in grid['cells']:continue
            if dx and dy and ((cell[0]+dx,cell[1]) not in grid['cells'] or (cell[0],cell[1]+dy) not in grid['cells']):continue
            value=cost+grid['step']*math.hypot(dx,dy)
            if value<=limit and value<costs.get(nxt,float('inf')):
                costs[nxt]=value;parents[nxt]=cell;heapq.heappush(queue,(value,nxt))
    return costs,parents


def distribute(grid, entry, candidates, reach=30., max_hydrants=40, progress=None, reserve=0.):
    if reach<=grid['step']*2:raise ValueError('Alcance insuficiente para a resolução.')
    reachable,_=distances(grid,entry)
    candidates=list(dict.fromkeys(c for c in candidates if c in reachable))
    if not candidates:raise ValueError('Sem posições candidatas acessíveis junto às paredes.')
    # Coverage includes the farthest point of the square, not just its centre.
    usable=reach-grid['step']*math.sqrt(2)/2-reserve
    if usable<=0:raise ValueError('Reserva de instalação excede o alcance disponível.')
    first=min(candidates,key=lambda c:reachable[c])
    coverage={};budget=0
    for index,candidate in enumerate(candidates):
        if progress:progress(index,len(candidates))
        costs,_=distances(grid,candidate,usable)
        coverage[candidate]=set(costs);budget+=len(costs)
        if budget>2000000:raise ValueError('Cobertura excede limite de memória. Restrinja as áreas analisadas.')
    chosen=[];uncovered=set(reachable);routes=[];counts=[]
    while uncovered and len(chosen)<max_hydrants:
        if not chosen:best=first
        else:
            best=None;score=0
            for candidate in candidates:
                if candidate in chosen:continue
                count=len(uncovered.intersection(coverage[candidate]))
                if count>score:score=count;best=candidate
            if best is None:break
        costs,parents=distances(grid,best,usable)
        served=uncovered.intersection(costs)
        if not served:break
        farthest=max(served,key=lambda c:costs[c]);path=[farthest]
        while path[-1]!=best:path.append(parents[path[-1]])
        routes.append(list(reversed(path)));counts.append(len(served))
        chosen.append(best);uncovered.difference_update(served)
    return {'positions':chosen,'routes':routes,'served_cells':counts,'uncovered':uncovered,
            'disconnected':grid['cells'].difference(reachable),'analyzed':len(grid['cells']),
            'reachable':len(reachable),'sampling':'grade conservadora; não inclui faixas descartadas junto às bordas'}
