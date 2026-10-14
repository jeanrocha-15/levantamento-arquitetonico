import ast
import pathlib
import types
import unittest
import xml.etree.ElementTree as ET
from test_dimensions import Vec
SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Cotar paredes do vinculo.pushbutton/preview.py'
def load():
    module=ast.parse(SOURCE.read_text(encoding='ascii'))
    nodes=[n for n in module.body if isinstance(n,ast.FunctionDef)]
    scope={};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),scope);return scope
class Tests(unittest.TestCase):
    def test_individual_offset_and_side_do_not_change_geometry(self):
        scope=load();wall=types.SimpleNamespace(UniqueId='wall');refs=['a','b']
        specs=[('comprimento',refs,Vec(0,0),Vec(4,0),Vec(0,1),2),('espessura',refs,Vec(0,0),Vec(0,.2),Vec(-1,0),1)]
        result=scope['apply_overrides'](specs,wall,{'wall|comprimento':{'offset_mm':12,'flip':True}},8,50)
        self.assertAlmostEqual(result[0][5],2+.004*50/.3048);self.assertEqual(result[0][4].y,-1)
        self.assertIs(result[0][1],refs);self.assertIs(result[0][2],specs[0][2]);self.assertEqual(result[1],specs[1])
        self.assertEqual(specs[0][5],2);self.assertEqual(specs[0][4].y,1)
    def test_exclusion_is_only_for_selected_wall_and_kind(self):
        scope=load();wall=types.SimpleNamespace(UniqueId='wall');specs=[('comprimento',[],Vec(0,0),Vec(4,0),Vec(0,1),1),('espessura',[],Vec(0,0),Vec(0,.2),Vec(-1,0),1)]
        result=scope['apply_overrides'](specs,wall,{'wall|comprimento':{'enabled':False}},8,50)
        self.assertEqual(len(result),1);self.assertEqual(result[0][0],'espessura')
        self.assertEqual(len(scope['apply_overrides'](specs,types.SimpleNamespace(UniqueId='other'),{'wall|comprimento':{'enabled':False}},8,50)),2)
    def test_change_keys_and_reset_are_individual(self):
        fn=load()['changed_keys'];before={'a|comprimento':{'flip':True},'b|espessura':{'offset_mm':9}};after={'b|espessura':{'offset_mm':9}}
        self.assertEqual(fn(before,after),{'a|comprimento'});self.assertFalse(fn(before,before))
    def test_failed_adjustment_remains_pending_but_exclusion_does_not(self):
        fn=load()['pending_keys']
        self.assertEqual(fn({'a','b','c'},{'a'},{'c':{'enabled':False}}),['b'])
    def test_xaml_controls_are_valid_and_unique(self):
        module=ast.parse(SOURCE.read_text(encoding='ascii'))
        xaml=next(n.value for n in ast.walk(module) if isinstance(n,ast.Constant) and isinstance(n.value,str) and '<Window xmlns=' in n.value)
        root=ET.fromstring(xaml);names=[e.attrib['{http://schemas.microsoft.com/winfx/2006/xaml}Name'] for e in root.iter() if '{http://schemas.microsoft.com/winfx/2006/xaml}Name' in e.attrib]
        self.assertEqual(len(names),len(set(names)))
        self.assertTrue({'drawing','choices','include','distance','apply','flip','reset','confirm','cancel','zoom_in','zoom_out'}.issubset(names))
if __name__=='__main__':unittest.main()
