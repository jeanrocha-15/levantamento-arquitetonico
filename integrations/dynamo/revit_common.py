"""Shared Dynamo PythonNet3 adapter; embedded in each graph at build time."""
import math
import clr
clr.AddReference('RevitAPI')
clr.AddReference('RevitAPIUI')
clr.AddReference('RevitServices')
clr.AddReference('System.Windows.Forms')
clr.AddReference('System.Drawing')
from Autodesk.Revit import DB
from Autodesk.Revit.UI.Selection import ObjectType
from Autodesk.Revit.Exceptions import OperationCanceledException
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager
from System.Windows import Forms as WF
from System.Drawing import Size, Point

doc=DocumentManager.Instance.CurrentDBDocument
uidoc=DocumentManager.Instance.CurrentUIApplication.ActiveUIDocument
view=doc.ActiveView
FT=.3048


def name_of(element):
    try:return element.Name
    except Exception:
        p=element.get_Parameter(DB.BuiltInParameter.SYMBOL_NAME_PARAM)
        return p.AsString() if p else str(element.Id.Value)


def configure(title, fields):
    form=WF.Form();form.Text=title;form.Width=620;form.Height=155+len(fields)*50
    form.StartPosition=WF.FormStartPosition.CenterScreen;form.TopMost=True
    form.FormBorderStyle=WF.FormBorderStyle.FixedDialog;form.MaximizeBox=False;form.MinimizeBox=False
    controls={}
    for index,(key,label,values,default) in enumerate(fields):
        text=WF.Label();text.Text=label;text.Location=Point(12,15+index*50);text.Size=Size(575,18)
        control=WF.ComboBox() if values is not None else WF.TextBox()
        control.Location=Point(12,34+index*50);control.Size=Size(575,25)
        if values is not None:
            control.DropDownStyle=WF.ComboBoxStyle.DropDownList
            for value in values:control.Items.Add(str(value))
            control.SelectedIndex=values.index(default) if default in values else 0
        else:control.Text=str(default)
        controls[key]=control;form.Controls.Add(text);form.Controls.Add(control)
    ok=WF.Button();ok.Text='Continuar';ok.DialogResult=WF.DialogResult.OK;ok.Location=Point(370,65+len(fields)*50)
    cancel=WF.Button();cancel.Text='Cancelar';cancel.DialogResult=WF.DialogResult.Cancel;cancel.Location=Point(475,65+len(fields)*50)
    form.Controls.Add(ok);form.Controls.Add(cancel);form.AcceptButton=ok;form.CancelButton=cancel
    try:
        if form.ShowDialog()!=WF.DialogResult.OK:raise OperationCanceledException()
        return {key:control.Text for key,control in controls.items()}
    finally:form.Dispose()


def number(text, low, high):
    value=float(text.replace(',','.'))
    if not math.isfinite(value) or not low<=value<=high:raise ValueError('Valor fora de {} a {}.'.format(low,high))
    return value


def source_options():
    result={'Projeto atual':None}
    for link in DB.FilteredElementCollector(doc).OfClass(DB.RevitLinkInstance):
        if link.GetLinkDocument() is not None and not link.IsHidden(view):
            result['{} [{}]'.format(name_of(link),link.Id.Value)]=link
    return result


def collect(source, link, category=None, klass=None):
    collector=DB.FilteredElementCollector(doc,view.Id,link.Id) if link else DB.FilteredElementCollector(doc,view.Id)
    if category is not None:collector=collector.OfCategory(category)
    if klass is not None:collector=collector.OfClass(klass)
    return list(collector.WhereElementIsNotElementType())


def require_plan():
    if doc.IsFamilyDocument or not isinstance(view,DB.ViewPlan) or view.IsTemplate or not view.GenLevel:
        raise ValueError('Abra uma planta de pavimento com nível associado.')
    if abs(view.ViewDirection.Z)<.999999:raise ValueError('Somente plantas horizontais são suportadas.')
    # End any idle Dynamo-managed transaction before native rollback groups.
    TransactionManager.Instance.ForceCloseTransaction()


def within_crop(a,b):
    if not view.CropBoxActive:return True
    box=view.CropBox
    for p in (a,b):
        local=box.Transform.Inverse.OfPoint(p)
        if not (box.Min.X<=local.X<=box.Max.X and box.Min.Y<=local.Y<=box.Max.Y):return False
    return True


def finish(message):
    WF.MessageBox.Show(message,'LAC · Dynamo')


def guarded(callback):
    try:
        require_plan()
        return callback()
    except OperationCanceledException:return {'status':'Cancelado pelo usuário; nenhuma operação pendente.'}
    except Exception as error:
        finish(str(error))
        return {'status':'Erro','mensagem':str(error)}
