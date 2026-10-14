"""Read-only exporter contract; actual Revit element access needs Revit validation."""
import ast
import pathlib
import types
import unittest
SOURCE=pathlib.Path(__file__).parents[1]/'LAC.extension/LAC.tab/Levantamento.panel/Exportar Revit para LAC.pushbutton/script.py'
class Point:
    def __init__(self,x,y,z=0):self.X,self.Y,self.Z=x,y,z
class Transform:
    def OfPoint(self,p):return Point(-p.Y+10,p.X+20,p.Z)
    def OfVector(self,p):return Point(-p.Y,p.X,p.Z)
class Line:
    IsBound=True;Length=10
    def GetType(self):return types.SimpleNamespace(Name='Line')
    def GetEndPoint(self,i):return Point(10*i,0)
class Arc:
    IsBound=True;Length=3.141592653589793;Radius=1;Center=Point(0,0);Normal=Point(0,0,1)
    def GetType(self):return types.SimpleNamespace(Name='Arc')
    def GetEndPoint(self,i):return Point(1-2*i,0)
    def Tessellate(self):return [Point(1,0),Point(0,1),Point(-1,0)]
def load():
    import math
    module=ast.parse(SOURCE.read_text(encoding='ascii'));nodes=[n for n in module.body if isinstance(n,ast.FunctionDef)]
    specs=types.SimpleNamespace(Length='length',Area='area',Volume='volume',Angle='angle')
    storage=types.SimpleNamespace(String='String',Double='Double',Integer='Integer',ElementId='ElementId')
    scope={'DB':types.SimpleNamespace(Line=Line,Arc=Arc,StorageType=storage,SpecTypeId=specs),'METERS_PER_FOOT':.3048,'math':math}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SOURCE),'exec'),scope);return scope
class Tests(unittest.TestCase):
    def test_line_units_and_host_transformation(self):
        record=load()['curve_data'](Line(),Transform())
        self.assertAlmostEqual(record['lengthM'],3.048)
        self.assertEqual(record['start'],[0,0,0]);self.assertEqual(record['end'],[3.048,0,0])
        self.assertEqual(record['hostStart'],[3.048,6.096,0]);self.assertTrue(record['isStraight'])
    def test_curves_remain_curves_with_explicit_approximation(self):
        record=load()['curve_data'](Arc(),Transform())
        self.assertFalse(record['isStraight']);self.assertEqual(record['kind'],'Arc');self.assertTrue(record['samplesAreApproximate']);self.assertEqual(len(record['samples']),3)
    def test_unbound_dimension_line_has_origin_and_direction_not_fake_length(self):
        line=Line();line.IsBound=False;line.Origin=Point(1,2);line.Direction=Point(1,0)
        result=load()['curve_data'](line,Transform())
        self.assertFalse(result['isBound']);self.assertNotIn('lengthM',result);self.assertEqual(result['hostDirection'],[0,1,0])
    def test_ids_are_lossless_strings(self):
        element=types.SimpleNamespace(Id=types.SimpleNamespace(Value=9007199254740993),UniqueId='stable-uuid')
        result=load()['element_ref'](element)
        self.assertEqual(result['elementId'],'9007199254740993');self.assertEqual(result['uniqueId'],'stable-uuid')
    def test_parameters_preserve_internal_and_convert_only_known_units(self):
        scope=load()
        for spec,value,expected,unit in [('length',10,3.048,'m'),('area',10,.9290304,'m2'),('volume',10,.28316846592,'m3'),('angle',3.141592653589793,180,'degrees')]:
            p=types.SimpleNamespace(Definition=types.SimpleNamespace(Name='Test',GetDataType=lambda spec=spec:spec),Id=types.SimpleNamespace(Value=1),StorageType='Double',HasValue=True,AsDouble=lambda value=value:value,AsValueString=lambda:'display')
            result=scope['parameter_data'](p,None)
            self.assertAlmostEqual(result['value'],expected);self.assertEqual(result['valueInternal'],value);self.assertEqual(result['unit'],unit)
    def test_export_does_not_start_transactions(self):
        module=ast.parse(SOURCE.read_text(encoding='ascii'))
        calls=[n.func.attr for n in ast.walk(module) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)]
        self.assertFalse({'Transaction','TransactionGroup','Create','Set','Delete'} & set(calls))
if __name__=='__main__':unittest.main()
