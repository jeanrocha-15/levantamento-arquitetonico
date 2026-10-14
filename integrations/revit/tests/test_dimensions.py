"""Geometry tests without Revit. Native reference creation must be checked in Revit."""
import ast
import math
import pathlib
import types
import unittest

SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Cotar paredes.pushbutton/script.py'
class Vec:
    def __init__(self,x,y,z=0):self.x,self.y,self.z=x,y,z
    def Add(self,b):return Vec(self.x+b.x,self.y+b.y,self.z+b.z)
    def Subtract(self,b):return Vec(self.x-b.x,self.y-b.y,self.z-b.z)
    def Multiply(self,k):return Vec(self.x*k,self.y*k,self.z*k)
    def DotProduct(self,b):return self.x*b.x+self.y*b.y+self.z*b.z
    def CrossProduct(self,b):return Vec(self.y*b.z-self.z*b.y,self.z*b.x-self.x*b.z,self.x*b.y-self.y*b.x)
    def Normalize(self):return self.Multiply(1/math.sqrt(self.DotProduct(self)))
    def Negate(self):return self.Multiply(-1)
class Ref:
    def __init__(self,key):self.key=key
    def ConvertToStableRepresentation(self,doc):return self.key
class Line:
    def __init__(self,a,b):self.points=[a,b]
    def GetEndPoint(self,i):return self.points[i]
class Location:
    def __init__(self,curve):self.Curve=curve
class Face:
    def __init__(self,point,normal,key):self.Origin,self.FaceNormal,self.Reference,self.Area=point,normal,Ref(key),1

def load():
    module=ast.parse(SOURCE.read_text(encoding='ascii'))
    nodes=[n for n in module.body if isinstance(n,ast.FunctionDef)]
    scope={'ALIGNMENT':.999999,'DB':types.SimpleNamespace(LocationCurve=Location,Line=Line,PlanarFace=Face,ShellLayerType=types.SimpleNamespace(Interior='i',Exterior='e'),HostObjectUtils=types.SimpleNamespace(GetSideFaces=lambda w,s:[w.side[s].Reference])),'revit':types.SimpleNamespace(doc=None)}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),scope)
    scope['faces_of']=lambda wall,view:wall.faces
    return scope
class Tests(unittest.TestCase):
    def fixture(self,angle):
        d=Vec(math.cos(angle),math.sin(angle));n=Vec(-d.y,d.x);start=Vec(7,11);end=start.Add(d.Multiply(4))
        a,b=Face(start,d.Negate(),'start'),Face(end,d,'end')
        inner,outer=Face(start.Subtract(n.Multiply(.1)),n.Negate(),'inner'),Face(start.Add(n.Multiply(.1)),n,'outer')
        wall=types.SimpleNamespace(Location=Location(Line(start,end)),Orientation=n,Width=.2,faces=[a,b,inner,outer],side={'i':inner,'e':outer})
        wall.GetGeometryObjectFromReference=lambda r:next(f for f in wall.faces if f.Reference.key==r.key)
        view=types.SimpleNamespace(ViewDirection=Vec(0,0,1),Origin=Vec(0,0,0))
        return wall,view,d,n
    def test_directions(self):
        for angle in (0,math.pi/2,math.pi/4,math.radians(82),math.radians(215)):
            with self.subTest(angle=angle):
                scope=load();w,v,d,n=self.fixture(angle);specs,errors=scope['dimension_specs'](w,v,'Comprimento + Espessura',.4)
                self.assertFalse(errors);self.assertEqual(len(specs),2)
                length=specs[0][3].Subtract(specs[0][2]);thickness=specs[1][3].Subtract(specs[1][2])
                self.assertAlmostEqual(length.DotProduct(d),4);self.assertAlmostEqual(abs(thickness.DotProduct(n)),.2);self.assertAlmostEqual(thickness.DotProduct(d),0)
                self.assertEqual([r.key for r in specs[0][1]],['start','end'])
    def test_modes_and_bad_references(self):
        scope=load();w,v,d,n=self.fixture(.4)
        self.assertEqual(len(scope['dimension_specs'](w,v,'Comprimento',.4)[0]),1)
        self.assertEqual(len(scope['dimension_specs'](w,v,'Espessura',.4)[0]),1)
        w.faces=w.faces[2:];specs,errors=scope['dimension_specs'](w,v,'Comprimento + Espessura',.4);self.assertEqual(len(specs),1);self.assertTrue(errors)
        w.Location.Curve=object()
        with self.assertRaises(ValueError):scope['dimension_specs'](w,v,'Comprimento',.4)
    def test_collision_and_duplicate_keys(self):
        scope=load();box=scope['polygon_of_box']((0,0,1,1))
        self.assertTrue(scope['overlaps'](box,scope['polygon_of_box']((.5,.5,2,2))))
        self.assertFalse(scope['overlaps'](box,scope['polygon_of_box']((2,2,3,3))))
        self.assertEqual(scope['reference_key'](None,[Ref('a'),Ref('b')]),scope['reference_key'](None,[Ref('b'),Ref('a')]))
if __name__=='__main__':unittest.main()
