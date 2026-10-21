import json
import math
from pathlib import Path
import unittest
import types
import hydrant_markers as markers
from route_core import make_grid, nearest, distances, distribute, coordinate, validate_contour
from build_graphs import build, ROOT


def rect(x,y,w,h):return [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]


class Routes(unittest.TestCase):
    def test_manual_contour_accepts_concavity_and_explicit_closure(self):
        polygon=[(0,0),(4,0),(4,2),(2,2),(2,4),(0,4),(0,0)]
        self.assertEqual(validate_contour(polygon),polygon[:-1])
        grid=make_grid([validate_contour(polygon)],[],.25)
        with self.assertRaises(ValueError):nearest(grid,(3.5,3.5),max_distance=.1)

    def test_invalid_manual_boundaries_are_rejected(self):
        for polygon in [[(0,0),(1,1)],[(0,0),(2,2),(0,2),(2,0)],[(0,0),(2,0),(2,0),(0,2)],[(0,0),(1,0),(2,0)]]:
            with self.subTest(polygon=polygon),self.assertRaises(ValueError):validate_contour(polygon)

    def test_manual_area_without_rooms_respects_open_door_and_void(self):
        boundary=validate_contour([(0,0),(8,0),(8,6),(0,6)])
        grid=make_grid([boundary],[rect(3.9,0,.2,2),rect(3.9,3.2,.2,2.8),rect(6,4,1,1)],.25)
        start=nearest(grid,(1,1));target=nearest(grid,(7,1))
        costs,_=distances(grid,start)
        self.assertIn(target,costs)
        with self.assertRaises(ValueError):nearest(grid,(6.5,4.5),max_distance=.1)
        self.assertTrue(all(0<x<8 and 0<y<6 for x,y in [coordinate(grid,c) for c in grid['cells']]))
    def test_thin_wall_cannot_be_crossed(self):
        grid=make_grid([rect(0,0,8,5)],[rect(3.91,0,.015,5)],.25)
        start=nearest(grid,(1,2));end=nearest(grid,(7,2))
        costs,_=distances(grid,start)
        self.assertNotIn(end,costs)

    def test_door_connects_rooms_and_detour_counts(self):
        regions=[rect(0,0,4,6),rect(4.2,0,4,6),rect(3.5,4.5,1.4,1.2)]
        obstacles=[rect(4,0,.2,4.5),rect(4,5.7,.2,.3)]
        grid=make_grid(regions,obstacles,.25)
        start=nearest(grid,(1,1));end=nearest(grid,(7,1))
        costs,_=distances(grid,start)
        self.assertIn(end,costs)
        self.assertGreater(costs[end],math.dist(coordinate(grid,start),coordinate(grid,end))+2)

    def test_disconnected_area_is_reported(self):
        grid=make_grid([rect(0,0,4,4),rect(7,0,4,4)],[],.5)
        start=nearest(grid,(1,1))
        result=distribute(grid,start,[start],30)
        self.assertTrue(result['disconnected'])
        self.assertEqual(len(result['positions']),1)

    def test_distribution_respects_limit_including_cell_and_installation_reserve(self):
        grid=make_grid([rect(0,0,30,4)],[],.5)
        start=nearest(grid,(1,2));candidates=[nearest(grid,(x,2)) for x in (1,6,11,16,21,26,29)]
        result=distribute(grid,start,candidates,8,reserve=.8)
        self.assertGreater(len(result['positions']),1)
        self.assertFalse(result['uncovered'])
        for route in result['routes']:
            distance=sum(math.dist(coordinate(grid,a),coordinate(grid,b)) for a,b in zip(route,route[1:]))
            self.assertLessEqual(distance+.5*math.sqrt(2)/2+.8,8+1e-9)

    def test_corner_cut_is_not_allowed(self):
        grid={'cells':{(0,0),(1,1)},'origin':(0,0),'step':1}
        costs,_=distances(grid,(0,0))
        self.assertNotIn((1,1),costs)

    def test_gaps_between_regions_are_not_tunnelled(self):
        grid=make_grid([rect(0,0,3.6,4),rect(3.65,0,4.35,4)],[],.5)
        costs,_=distances(grid,nearest(grid,(1,2)))
        self.assertNotIn(nearest(grid,(6,2)),costs)

    def test_budget_and_invalid_inputs(self):
        with self.assertRaises(ValueError):make_grid([rect(0,0,500,500)],[],.1,max_cells=1000)
        with self.assertRaises(ValueError):make_grid([],[],.25)
        grid=make_grid([rect(0,0,4,4)],[],.5)
        with self.assertRaises(ValueError):nearest(grid,(20,20))
        start=nearest(grid,(1,1))
        with self.assertRaises(ValueError):distribute(grid,start,[],30)


class Graphs(unittest.TestCase):
    def test_portable_graphs_have_manual_execution_and_compilable_embedded_code(self):
        build()
        for file in ROOT.glob('*.dyn'):
            data=json.loads(file.read_text(encoding='utf-8'))
            self.assertEqual(data['View']['Dynamo']['RunType'],'Manual')
            self.assertFalse(data['Nodes'][0]['InputValue'])
            python=data['Nodes'][1]
            self.assertEqual(python['Engine'],'PythonNet3')
            compile(python['Code'],str(file),'exec')
            self.assertNotIn('from pyrevit',python['Code'])
            self.assertNotIn('ValueOverride',python['Code'])
            self.assertEqual(data['Connectors'][0]['End'],python['Inputs'][0]['Id'])
            if 'Cotas' in file.name:
                self.assertIn('def endpoint_candidates',python['Code'])
                self.assertIn('Todas as paredes visíveis',python['Code'])
                self.assertIn('Externas + trechos principais',python['Code'])
            else:
                self.assertIn('Marcadores genéricos leves no Revit',python['Code'])
                self.assertIn('if is_hydrant_marker(element):return None',python['Code'])


class Markers(unittest.TestCase):
    def test_only_our_markers_are_ignored_and_names_remain_unique_after_deletion(self):
        self.assertTrue(markers.is_hydrant_marker(types.SimpleNamespace(ApplicationId=markers.MARKER_APP)))
        self.assertFalse(markers.is_hydrant_marker(types.SimpleNamespace(ApplicationId='another-tool')))
        self.assertFalse(markers.is_hydrant_marker(types.SimpleNamespace()))
        self.assertEqual(markers.next_marker_label({'H-P001','H-P003'}),'H-P002')
        self.assertNotEqual(markers.marker_context('level1',1),markers.marker_context('level1',2))
        self.assertNotEqual(markers.marker_context('level1',1),markers.marker_context('level2',1))

    def test_duplicate_detection_uses_current_geometry_and_correct_phase_level(self):
        class Vec:
            def __init__(self,x,y,z=0):self.X,self.Y,self.Z=x,y,z
            def Add(self,b):return Vec(self.X+b.X,self.Y+b.Y,self.Z+b.Z)
            def Multiply(self,k):return Vec(self.X*k,self.Y*k,self.Z*k)
        context=markers.marker_context('level1',1)
        bbox=types.SimpleNamespace(Min=Vec(0,0),Max=Vec(1,1),Transform=types.SimpleNamespace(OfPoint=lambda p:p))
        element=types.SimpleNamespace(ApplicationId=markers.MARKER_APP,ApplicationDataId=context+'H-P001',get_BoundingBox=lambda view:bbox)
        markers.FT=.3048
        self.assertTrue(markers.marker_matches(element,context,Vec(.5,.5)))
        self.assertFalse(markers.marker_matches(element,markers.marker_context('level2',1),Vec(.5,.5)))
        self.assertFalse(markers.marker_matches(element,context,Vec(20,20)))
        bbox.Min,bbox.Max=Vec(19.5,19.5),Vec(20.5,20.5)
        self.assertTrue(markers.marker_matches(element,context,Vec(20,20)))
        self.assertFalse(markers.marker_matches(element,context,Vec(.5,.5)))


if __name__=='__main__':unittest.main()
