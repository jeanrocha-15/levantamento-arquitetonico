# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import os
import runpy
path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Importar LAC.pushbutton', 'script.py')
runpy.run_path(path, init_globals={'LAC_UPDATE': True}, run_name='__main__')
