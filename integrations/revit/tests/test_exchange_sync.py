import ast
import math
import pathlib
import unittest

SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Sincronizar LAC Exchange.pushbutton/script.py'

def load():
    tree=ast.parse(SOURCE.read_text(encoding='ascii'))
    scope={'math':math}
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),str(SOURCE),'exec'),scope)
    return scope

class ExchangeTests(unittest.TestCase):
    def test_equal_area_does_not_hide_different_room_shapes(self):
        rectangle=[[0,0],[4,0],[4,3],[0,3]]
        moved=[[1,0],[5,0],[5,3],[1,3]]
        self.assertEqual(load()['boundary_residual'](rectangle,rectangle),0)
        self.assertGreater(load()['boundary_residual'](rectangle,moved),.01)

    def test_interior_point_of_concave_room(self):
        scope=load()
        polygon=[[0,0,0],[4,0,0],[4,1,0],[1,1,0],[1,4,0],[0,4,0]]
        point=scope['room_point'](polygon)
        self.assertTrue(scope['point_in_polygon'](point,polygon))
        self.assertFalse(scope['point_in_polygon']([2,2,0],polygon))

    def test_duplicate_physical_ids_rejected(self):
        data={'format':'lac-exchange','schemaVersion':1,'units':'m','levels':[], 'physicalWalls':[{'lacId':'wall'}],'openings':[{'lacId':'wall'}],'elements':[],'rooms':[]}
        with self.assertRaises(ValueError):load()['validate'](data)

    def test_all_new_sources_compile(self):
        root=SOURCE.parents[3]
        for path in [SOURCE,root/'lib/lac_exchange.py']:
            compile(path.read_text(encoding='ascii'),str(path),'exec')

if __name__=='__main__':unittest.main()
