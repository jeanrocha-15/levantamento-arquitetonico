"""Linked dimension transformation and instance identity, without native Revit."""
import ast
import math
import pathlib
import types
import unittest
from test_dimensions import Vec, Ref, Line, Location, load
SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Cotar paredes do vinculo.pushbutton/script.py'
class Transform:
    def __init__(self,angle=0,offset=None,mirror=False):
        self.x=Vec(math.cos(angle),math.sin(angle));self.y=Vec(-math.sin(angle),math.cos(angle)).Multiply(-1 if mirror else 1);self.offset=offset or Vec(0,0)
    def OfVector(self,p):return self.x.Multiply(p.x).Add(self.y.Multiply(p.y)).Add(Vec(0,0,p.z))
    def OfPoint(self,p):return self.OfVector(p).Add(self.offset)
    @property
    def Inverse(self):
        source=self
        return types.SimpleNamespace(OfVector=lambda p:Vec(p.DotProduct(source.x),p.DotProduct(source.y),p.z),OfPoint=lambda p:Vec(p.Subtract(source.offset).DotProduct(source.x),p.Subtract(source.offset).DotProduct(source.y),p.z-source.offset.z))
class LinkedRef(Ref):
    def CreateLinkReference(self,link):
        ref=Ref(str(link.Id)+':'+self.key);ref.ElementId=link.Id;return ref

def linked_scope():
    module=ast.parse(SOURCE.read_text(encoding='ascii'))
    nodes=[node for node in module.body if isinstance(node,(ast.FunctionDef,ast.ClassDef))]
    scope={'DB':types.SimpleNamespace(LocationCurve=Location,Line=Line),'revit':types.SimpleNamespace(doc='host'),'reference_key':load()['reference_key']}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),scope)
    return scope
class Tests(unittest.TestCase):
    def test_transform_and_reference_instance(self):
        for angle,mirror in ((0,False),(math.pi/2,False),(math.pi/4,True)):
            with self.subTest(angle=angle,mirror=mirror):
                scope=linked_scope();t=Transform(angle,Vec(10,20),mirror);link=types.SimpleNamespace(Id=8,GetTotalTransform=lambda:t)
                view=types.SimpleNamespace(Origin=Vec(0,0),ViewDirection=Vec(0,0,1),RightDirection=Vec(1,0),UpDirection=Vec(0,1))
                original=(Vec(1,2),Vec(5,2))
                helpers={'dimension_specs':lambda *args:([('comprimento',[LinkedRef('a'),LinkedRef('b')],original[0],original[1],Vec(0,1),.4)],[]),'project_to_view':load()['project_to_view']}
                result,errors=scope['linked_specs'](None,view,'Comprimento',.4,link,helpers)
                self.assertFalse(errors);self.assertEqual(len(result),1)
                delta=result[0][3].Subtract(result[0][2]);self.assertAlmostEqual(delta.DotProduct(delta),16)
                self.assertEqual([r.ElementId for r in result[0][1]],[8,8])
                self.assertAlmostEqual(result[0][2].x,t.OfPoint(original[0]).x)
                link2=types.SimpleNamespace(Id=9,GetTotalTransform=lambda:t)
                result2,_=scope['linked_specs'](None,view,'Comprimento',.4,link2,helpers)
                self.assertNotEqual(scope['reference_key']('host',result[0][1]),scope['reference_key']('host',result2[0][1]))
    def test_conversion_error_does_not_create_incorrect_specs(self):
        scope=linked_scope();t=Transform();link=types.SimpleNamespace(Id=8,GetTotalTransform=lambda:t)
        view=types.SimpleNamespace(Origin=Vec(0,0),ViewDirection=Vec(0,0,1),RightDirection=Vec(1,0),UpDirection=Vec(0,1))
        helpers={'dimension_specs':lambda *args:([('comprimento',[Ref('bad'),Ref('bad2')],Vec(0,0),Vec(4,0),Vec(0,1),.4)],[])}
        result,errors=scope['linked_specs'](None,view,'Comprimento',.4,link,helpers)
        self.assertFalse(result);self.assertTrue(errors)
    def test_linked_view_is_not_a_host_view_in_link_document(self):
        scope=linked_scope();t=Transform(math.pi/2,Vec(10,20));view=types.SimpleNamespace(Origin=Vec(10,20),ViewDirection=Vec(0,0,1),RightDirection=Vec(1,0),UpDirection=Vec(0,1))
        local=scope['LinkedView'](view,t.Inverse)
        self.assertIsNone(local.native_view);self.assertAlmostEqual(local.Origin.x,0);self.assertAlmostEqual(local.Origin.y,0)
if __name__=='__main__':unittest.main()
