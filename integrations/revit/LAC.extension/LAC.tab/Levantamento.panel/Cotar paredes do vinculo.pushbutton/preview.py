# -*- coding: utf-8 -*-
from __future__ import unicode_literals

def selection_key(wall,kind):
    return wall.UniqueId+'|'+kind

def apply_overrides(specs,wall,overrides,offset_mm,scale):
    result=[]
    for kind,refs,p,q,away,distance in specs:
        settings=overrides.get(selection_key(wall,kind),{})
        if settings.get('enabled',True) is False:continue
        individual=settings.get('offset_mm',offset_mm)
        distance+=(individual-offset_mm)/1000.0*scale/0.3048
        if settings.get('flip',False):away=away.Negate()
        result.append((kind,refs,p,q,away,distance))
    return result

def changed_keys(before,after):
    return {key for key in set(before)|set(after) if before.get(key,{})!=after.get(key,{})}

def pending_keys(requested,applied,overrides):
    return sorted(key for key in requested-applied if overrides.get(key,{}).get('enabled',True))

def show_preview(rows,view,offset_mm,saved):
    from pyrevit import forms
    from System.Windows.Controls import Canvas, ListBoxItem, TextBlock
    from System.Windows.Shapes import Line
    from System.Windows.Media import Brushes
    import copy
    xaml="""<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="LAC - Previa interativa das cotas" Width="1100" Height="760" MinWidth="840" MinHeight="580" WindowStartupLocation="CenterScreen" ShowInTaskbar="False">
    <Grid Margin="16"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <TextBlock Text="Clique na linha de uma cota ou na lista para selecionar. A previa nao altera o modelo." TextWrapping="Wrap" Margin="0,0,0,12"/>
    <Grid Grid.Row="1"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="300"/></Grid.ColumnDefinitions>
    <DockPanel><StackPanel DockPanel.Dock="Top" Orientation="Horizontal" Margin="0,0,0,8"><Button x:Name="zoom_out" Content="-" Width="40" Margin="0,0,6,0"/><Button x:Name="zoom_in" Content="+" Width="40" Margin="0,0,6,0"/><Button x:Name="fit" Content="Ajustar" Padding="10,5"/></StackPanel><ScrollViewer HorizontalScrollBarVisibility="Auto" VerticalScrollBarVisibility="Auto"><Canvas x:Name="drawing" Width="680" Height="560" Background="#F8FAFC"/></ScrollViewer></DockPanel>
    <StackPanel Grid.Column="1" Margin="14,0,0,0"><TextBlock Text="Cotas individuais" FontWeight="Bold"/><ListBox x:Name="choices" Height="260" Margin="0,8,0,10"/><TextBlock x:Name="selected_title" Text="Selecione uma cota" FontWeight="Bold" TextWrapping="Wrap" Margin="0,0,0,8"/><CheckBox x:Name="include" Content="Incluir esta cota na operacao" Margin="0,0,0,10"/><TextBlock Text="Afastamento desta cota (mm na folha)" TextWrapping="Wrap"/><TextBox x:Name="distance" Margin="0,6,0,6"/><Button x:Name="apply" Content="Aplicar afastamento" Padding="10,6" Margin="0,0,0,8"/><Button x:Name="flip" Content="Inverter lado desta cota" Padding="10,6" Margin="0,0,0,8"/><Button x:Name="reset" Content="Restaurar padrao desta cota" Padding="10,6"/><TextBlock x:Name="status" TextWrapping="Wrap" Margin="0,12,0,0"/><TextBlock Text="Excluir da operacao nao apaga cotas existentes. Posicao e referencias nativas serao validadas ao confirmar." TextWrapping="Wrap" Margin="0,12,0,0"/></StackPanel>
    </Grid><StackPanel Grid.Row="2" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,12,0,0"><Button x:Name="cancel" Content="Cancelar" Padding="16,8" Margin="0,0,8,0"/><Button x:Name="confirm" Content="Continuar com esta selecao" Padding="16,8"/></StackPanel></Grid></Window>"""
    class Preview(forms.WPFWindow):
        def __init__(self):
            forms.WPFWindow.__init__(self,xaml,literal_string=True)
            self.rows=rows;self.overrides=copy.deepcopy(saved);self.result=None;self.active=None;self.loading=False;self.zoom=1
            for name in ('drawing','choices','selected_title','include','distance','status','zoom_in','zoom_out','fit','apply','flip','reset','cancel','confirm'):setattr(self,name,self.FindName(name))
            self.items={};self.line_items={}
            for row in rows:
                for spec in row['specs']:
                    key=selection_key(row['wall'],spec[0])
                    if key in self.items:continue
                    item=ListBoxItem();item.Content='Parede {0} - {1}'.format(row['wall'].Id.Value,spec[0]);item.Tag=key
                    self.choices.Items.Add(item);self.items[key]=(row,spec,item)
            self.choices.SelectionChanged+=self.on_choice
            self.include.Checked+=self.on_include;self.include.Unchecked+=self.on_include
            self.apply.Click+=self.on_apply;self.flip.Click+=self.on_flip;self.reset.Click+=self.on_reset
            self.cancel.Click+=lambda sender,event:self.Close()
            self.confirm.Click+=self.on_confirm
            self.zoom_in.Click+=lambda sender,event:self.change_zoom(1.25)
            self.zoom_out.Click+=lambda sender,event:self.change_zoom(.8)
            self.fit.Click+=self.on_fit
            self.redraw()
            if self.choices.Items.Count:self.choices.SelectedIndex=0
        def on_fit(self,sender,event):self.zoom=1;self.redraw()
        def change_zoom(self,factor):self.zoom=max(.5,min(8,self.zoom*factor));self.redraw()
        def select_key(self,key):self.choices.SelectedItem=self.items[key][2]
        def on_choice(self,sender,event):
            if not self.choices.SelectedItem:return
            self.active=self.choices.SelectedItem.Tag;self.loading=True
            settings=self.overrides.get(self.active,{})
            self.selected_title.Text=str(self.choices.SelectedItem.Content)
            self.include.IsChecked=settings.get('enabled',True)
            self.distance.Text=str(settings.get('offset_mm',offset_mm))
            self.loading=False;self.redraw()
        def set_setting(self,name,value):
            if not self.active:return
            settings=dict(self.overrides.get(self.active,{}));settings[name]=value
            if settings.get('enabled',True):settings.pop('enabled',None)
            if not settings.get('flip',False):settings.pop('flip',None)
            if settings.get('offset_mm')==offset_mm:settings.pop('offset_mm',None)
            if settings:self.overrides[self.active]=settings
            else:self.overrides.pop(self.active,None)
            self.redraw()
        def on_include(self,sender,event):
            if not self.loading:self.set_setting('enabled',bool(self.include.IsChecked))
        def on_apply(self,sender,event):
            try:
                value=float(self.distance.Text.replace(',','.'))
                if not 1<=value<=100:raise ValueError()
                self.set_setting('offset_mm',value);self.status.Text='Afastamento individual aplicado.'
            except ValueError:self.status.Text='Informe um numero de 1 a 100 mm.'
        def on_flip(self,sender,event):self.set_setting('flip',not self.overrides.get(self.active,{}).get('flip',False))
        def on_reset(self,sender,event):
            if self.active:self.overrides.pop(self.active,None);self.on_choice(None,None)
        def on_confirm(self,sender,event):
            if self.active:
                try:
                    value=float(self.distance.Text.replace(',','.'))
                    if not 1<=value<=100:raise ValueError()
                    self.set_setting('offset_mm',value)
                except ValueError:
                    self.status.Text='Corrija o afastamento individual antes de continuar.';return
            if all(self.overrides.get(key,{}).get('enabled',True) is False for key in self.items):
                self.status.Text='Inclua pelo menos uma cota.';return
            self.result=self.overrides;self.Close()
        def redraw(self):
            self.drawing.Children.Clear();segments=[];points=[]
            for row in self.rows:
                footprint=row['footprint'] or []
                if footprint:
                    points.extend(footprint)
                    for index,p in enumerate(footprint):segments.append((p,footprint[(index+1)%len(footprint)],None,None,True))
            for key,(row,spec,item) in self.items.items():
                settings=self.overrides.get(key,{})
                draw_settings=dict(settings);draw_settings['enabled']=True
                shown=apply_overrides([spec],row['wall'],{key:draw_settings},offset_mm,view.Scale)[0]
                kind,refs,p,q,away,distance=shown
                a,b=p.Add(away.Multiply(distance)),q.Add(away.Multiply(distance))
                coords=[(v.DotProduct(view.RightDirection),v.DotProduct(view.UpDirection)) for v in (a,b)]
                points.extend(coords);segments.append((coords[0],coords[1],key,kind,settings.get('enabled',True)))
                item.Opacity=1 if settings.get('enabled',True) else .45
            if not points:return
            x0=min(p[0] for p in points);y0=min(p[1] for p in points);width=max(p[0] for p in points)-x0;height=max(p[1] for p in points)-y0
            scale=min(620/max(width,.01),500/max(height,.01))*self.zoom
            self.drawing.Width=max(680,width*scale+60);self.drawing.Height=max(560,height*scale+60)
            for p,q,key,kind,enabled in segments:
                line=Line();line.X1=30+(p[0]-x0)*scale;line.Y1=30+(height-(p[1]-y0))*scale;line.X2=30+(q[0]-x0)*scale;line.Y2=30+(height-(q[1]-y0))*scale
                line.Stroke=Brushes.Gray if key is None or not enabled else Brushes.DeepSkyBlue if key==self.active else Brushes.RoyalBlue if kind=='comprimento' else Brushes.DarkOrange
                line.StrokeThickness=4 if key==self.active else 2;line.IsHitTestVisible=False
                self.drawing.Children.Add(line)
                if key:
                    hit=Line();hit.X1=line.X1;hit.Y1=line.Y1;hit.X2=line.X2;hit.Y2=line.Y2;hit.Stroke=Brushes.Transparent;hit.StrokeThickness=14
                    hit.MouseLeftButtonDown+=lambda sender,event,key=key:self.select_key(key)
                    self.drawing.Children.Add(hit)
            included=sum(1 for key in self.items if self.overrides.get(key,{}).get('enabled',True))
            self.status.Text='{0} de {1} cotas incluidas. Zoom {2}%'.format(included,len(self.items),int(self.zoom*100))
    window=Preview();window.show_dialog();return window.result
