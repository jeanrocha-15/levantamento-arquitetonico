import ast
import pathlib
import types
import unittest
from xml.sax.saxutils import escape
from test_dimensions import Vec
from test_link_dimensions import Transform
SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Cotar paredes do vinculo.pushbutton/workflow.py'
def load():
    module=ast.parse(SOURCE.read_text(encoding='ascii'))
    nodes=[n for n in module.body if isinstance(n,ast.FunctionDef)]
    scope={'escape':escape,'DB':types.SimpleNamespace()}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),scope)
    return scope
class Tests(unittest.TestCase):
    def test_settings_are_per_document_view_and_link(self):
        key=load()['context_key'];doc=types.SimpleNamespace(ProjectInformation=types.SimpleNamespace(UniqueId='doc'))
        self.assertNotEqual(key(doc,types.SimpleNamespace(UniqueId='view1'),types.SimpleNamespace(UniqueId='link')),key(doc,types.SimpleNamespace(UniqueId='view2'),types.SimpleNamespace(UniqueId='link')))
        self.assertNotEqual(key(doc,types.SimpleNamespace(UniqueId='view'),types.SimpleNamespace(UniqueId='a')),key(doc,types.SimpleNamespace(UniqueId='view'),types.SimpleNamespace(UniqueId='b')))
    def test_paper_offset_validation(self):
        parse=load()['parse_offset'];self.assertEqual(parse('8,5'),8.5)
        for value in ('0','101','nan','inf','bad'):
            with self.assertRaises(ValueError):parse(value)
    def test_only_registered_dimensions_are_repair_candidates(self):
        good=types.SimpleNamespace(IsValidObject=True,AreReferencesAvailable=True,Value=4)
        bad=types.SimpleNamespace(IsValidObject=True,AreReferencesAvailable=False,Value=None)
        records=[{'dimension':'good','wall':'wall','link':'link','kind':'comprimento'},{'dimension':'bad','wall':'wall','link':'link','kind':'espessura'},{'dimension':'gone','wall':'wall','link':'link','kind':'comprimento'},{'dimension':'other','wall':'wall','link':'another','kind':'comprimento'}]
        doc=types.SimpleNamespace(GetElement=lambda uid:{'good':good,'bad':bad,'other':good}.get(uid))
        found,kept=load()['managed_dimensions'](doc,records,types.SimpleNamespace(UniqueId='link'),[types.SimpleNamespace(UniqueId='wall')])
        self.assertTrue(found[('wall','comprimento')][0][1]);self.assertFalse(found[('wall','espessura')][0][1]);self.assertEqual(len(kept),3);self.assertEqual(len(found),2)
    def test_position_controls_preserve_dimensions_and_references(self):
        scope=load();t=Transform();link=types.SimpleNamespace(GetTotalTransform=lambda:t)
        curve=types.SimpleNamespace(GetEndPoint=lambda i:Vec(4*i,0))
        wall=types.SimpleNamespace(Location=types.SimpleNamespace(Curve=curve))
        refs=['a','b'];specs=[('comprimento',refs,Vec(0,0),Vec(4,0),Vec(0,1),.4),('espessura',refs,Vec(0,-.1),Vec(0,.1),Vec(-1,0),.4)]
        result=scope['adjust_specs'](specs,wall,link,None,'Interior','Final',.4)
        self.assertEqual(result[0][4].y,-1);self.assertEqual(result[1][2].x,4);self.assertEqual(result[1][3].x,4)
        self.assertAlmostEqual(result[1][3].Subtract(result[1][2]).y,.2);self.assertIs(result[0][1],refs)
        self.assertEqual(specs[0][4].y,1);self.assertEqual(specs[1][2].x,0)
    def test_preview_does_not_modify_model_and_escapes_messages(self):
        scope=load();wall=types.SimpleNamespace(Id=types.SimpleNamespace(Value=7));view=types.SimpleNamespace(RightDirection=Vec(1,0),UpDirection=Vec(0,1))
        rows=[{'wall':wall,'footprint':[(0,0),(4,0),(4,.2),(0,.2)],'specs':[('comprimento',[],Vec(0,0),Vec(4,0),Vec(0,1),.4)],'errors':['<bad>']}]
        html=scope['preview_html'](rows,view,{})
        self.assertIn('<svg',html);self.assertIn('&lt;bad&gt;',html);self.assertNotIn('<bad>',html)
if __name__=='__main__':unittest.main()
