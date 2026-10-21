"""Generate portable Dynamo 4 graphs. Run after editing the source adapters."""
import ast
import json
from pathlib import Path
import uuid

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[1]


def identifier(name):
    return uuid.uuid5(uuid.NAMESPACE_URL,'lac-dynamo:'+name).hex


def dimension_helpers():
    original=REPO/'integrations/revit/LAC.extension/LAC.tab/Levantamento.panel/Cotar paredes.pushbutton/script.py'
    tree=ast.parse(original.read_text(encoding='utf-8'))
    functions=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name!='main']
    # Embed existing pure helpers, without importing pyRevit or executing its UI.
    code=ast.unparse(ast.Module(body=functions,type_ignores=[]))
    return 'import types\nALIGNMENT=.999999\nrevit=types.SimpleNamespace(doc=doc)\n'+code+'\n'


def graph(name,description,body):
    toggle,python=identifier(name+'-toggle'),identifier(name+'-python')
    output,port,result=identifier(name+'-boolean'),identifier(name+'-input'),identifier(name+'-result')
    nodes=[
        {'ConcreteType':'CoreNodeModels.Input.BoolSelector, CoreNodeModels','Id':toggle,'NodeType':'BooleanInputNode',
         'Inputs':[],'Outputs':[{'Id':output,'Name':'','Description':'Executar','UsingDefaultValue':False,'Level':2,'UseLevels':False,'KeepListStructure':False}],
         'Replication':'Disabled','Description':'Ative para executar','InputValue':False},
        {'ConcreteType':'PythonNodeModels.PythonNode, PythonNodeModels','Id':python,'NodeType':'PythonScriptNode',
         'Code':body,'Engine':'PythonNet3','VariableInputPorts':True,
         'Inputs':[{'Id':port,'Name':'IN[0]','Description':'Executar','UsingDefaultValue':False,'Level':2,'UseLevels':False,'KeepListStructure':False}],
         'Outputs':[{'Id':result,'Name':'OUT','Description':'Relatório e prévia','UsingDefaultValue':False,'Level':2,'UseLevels':False,'KeepListStructure':False}],
         'Replication':'Disabled','Description':description},
    ]
    return {'Uuid':identifier(name),'IsCustomNode':False,'Description':description,'Name':name,
            'ElementResolver':{'ResolutionMap':{}},'Inputs':[],'Outputs':[], 'Nodes':nodes,
            'Connectors':[{'Start':output,'End':port,'Id':identifier(name+'-connection'),'IsHidden':'False'}],
            'Dependencies':[], 'NodeLibraryDependencies':[],
            'Bindings':[], 'View':{'Dynamo':{'ScaleFactor':1.,'HasRunWithoutCrash':False,'IsVisibleInDynamoLibrary':True,
                    'Version':'4.0.2.3852','RunType':'Manual','RunPeriod':'1000'},
            'NodeViews':[{'Id':toggle,'Name':'Executar','IsSetAsInput':True,'IsSetAsOutput':False,'Excluded':False,'ShowGeometry':False,'X':70.,'Y':100.},
                         {'Id':python,'Name':name,'IsSetAsInput':False,'IsSetAsOutput':True,'Excluded':False,'ShowGeometry':True,'X':350.,'Y':100.}],
            'Annotations':[], 'X':0.,'Y':0.,'Zoom':1.}}


def build():
    common=(ROOT/'revit_common.py').read_text(encoding='utf-8')+'\n'
    for filename,name,description,core in [
        ('hidrantes.py','LAC_Hidrantes_Layout','Proposta de hidrantes por caminhamento; revisar antes de inserir.',(ROOT/'route_core.py').read_text(encoding='utf-8')+'\n'),
        ('cotas_gerais.py','LAC_Cotas_Gerais','Cotas gerais e encadeadas com referências nativas de paredes.',dimension_helpers()),
    ]:
        code=common+core+(ROOT/filename).read_text(encoding='utf-8')
        compile(code,name,'exec')
        path=ROOT/(name+'.dyn');path.write_text(json.dumps(graph(name,description,code),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(path.name)


if __name__=='__main__':build()
