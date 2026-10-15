# -*- coding: utf-8 -*-
from __future__ import unicode_literals
import json
from System import Guid, String
from Autodesk.Revit.DB.ExtensibleStorage import Schema, SchemaBuilder, Entity, AccessLevel

SCHEMA_ID=Guid('6ad5ef90-3ee2-46ce-8dbe-f65a1bb27341')

def schema(create=False):
    result=Schema.Lookup(SCHEMA_ID)
    if result or not create:return result
    builder=SchemaBuilder(SCHEMA_ID)
    builder.SetSchemaName('LacExchangeIdentityV1')
    builder.SetReadAccessLevel(AccessLevel.Public)
    builder.SetWriteAccessLevel(AccessLevel.Public)
    builder.AddSimpleField('Payload',String)
    return builder.Finish()

def read_identity(element):
    try:
        definition=schema()
        if not definition:return {}
        entity=element.GetEntity(definition)
        if not entity.IsValid():return {}
        return json.loads(entity.Get[String](definition.GetField('Payload')))
    except Exception:return {}

def write_identity(element,payload):
    definition=schema(True);entity=Entity(definition)
    entity.Set[String](definition.GetField('Payload'),json.dumps(payload,ensure_ascii=True,allow_nan=False))
    element.SetEntity(entity)

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)

def change_status(base,local,remote):
    lc=canonical(local)!=canonical(base);rc=canonical(remote)!=canonical(base)
    if lc and rc and canonical(local)!=canonical(remote):return 'conflict'
    if lc and not rc:return 'lac'
    if rc and not lc:return 'revit'
    return 'same'
