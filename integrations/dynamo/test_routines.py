import json
import math
from pathlib import Path
import unittest
from route_core import make_grid, nearest, distances, distribute, coordinate
from build_graphs import build, ROOT


def rect(x,y,w,h):return [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]


class Routes(unittest.TestCase):
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


if __name__=='__main__':unittest.main()
