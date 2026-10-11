"""Prepare or safely apply a private XLSX import. Never publish prospect records."""
import argparse
import hashlib
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

LIBRARY_ID = 'libfile_1af6feab7c988191ba680bf9e0a74f97'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def read_records(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        relations = {r.attrib['Id']: r.attrib['Target'].lstrip('/') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS):
            target = relations[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target if target.startswith('xl/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row', NS):
                values = {}
                for cell in row:
                    value = cell.find('m:v', NS)
                    value = value.text if value is not None else ''
                    if cell.attrib.get('t') == 's':
                        value = strings[int(value)]
                    elif cell.attrib.get('t') == 'inlineStr':
                        value = ''.join(cell.find('m:is', NS).itertext())
                    values[re.sub(r'\d', '', cell.attrib['r'])] = value
                rows.append(values)
            headers = rows[0]
            sheets[sheet.attrib['name']] = [{title: row.get(column, '') for column, title in headers.items()} for row in rows[1:] if any(row.values())]
    return sheets

def plan(path, version):
    records = read_records(path)
    prospects = records['Prospects']
    pages = records['Page content']
    ids = [p['business_id'] for p in prospects]
    page_ids = [p['business_id'] for p in pages]
    if len(ids) != len(set(ids)) or len(page_ids) != len(set(page_ids)):
        raise ValueError('Duplicate stable business IDs in source workbook')
    if set(ids) != set(page_ids):
        raise ValueError('Prospects and Page content must have matching business IDs')
    if any(not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', bid) for bid in ids):
        raise ValueError('Unsafe business ID in source workbook')
    source = {'library_file_id': LIBRARY_ID, 'version': version, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest()}
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for prefix, rows in [('PROSPECT', prospects), ('PAGE', pages)]:
        for row in rows:
            items.append({'pk': prefix + '#' + row['business_id'], 'business_id': row['business_id'], 'revision': 1, 'fields': row, 'imported_fields_snapshot': row, 'source': source, 'imported_at': now, 'public_enabled': False})
    items.append({'pk': 'WORKFLOW#research', 'revision': 1, 'rules': records['Workflow'], 'source': source, 'imported_at': now})
    return {'source': source, 'prospect_count': len(prospects), 'page_count': len(pages), 'items': items}

def merge(existing, incoming):
    """Three-way merge: retain changes made in the database since the last import."""
    if not existing:
        return incoming, []
    if existing.get('source', {}).get('sha256') == incoming['source']['sha256']:
        return existing, []
    if incoming['source']['version'] <= existing.get('source', {}).get('version', 0):
        raise ValueError('Source version is stale; re-read the latest workbook')
    baseline = existing.get('imported_fields_snapshot', {})
    fields = dict(existing.get('fields', {}))
    conflicts = []
    for key, value in incoming.get('fields', {}).items():
        if key in fields and fields[key] != baseline.get(key):
            if fields[key] != value:
                conflicts.append(key)
        else:
            fields[key] = value
    merged = {**existing, **incoming, 'revision': existing.get('revision', 0) + 1, 'public_enabled': existing.get('public_enabled', False)}
    if 'fields' in incoming:
        merged['fields'] = fields
    return merged, conflicts

def apply(table_name, data, region):
    import boto3
    from boto3.dynamodb.conditions import Attr
    table = boto3.resource('dynamodb', region_name=region).Table(table_name)
    written = unchanged = 0
    conflicts = {}
    for incoming in data['items']:
        existing = table.get_item(Key={'pk': incoming['pk']}, ConsistentRead=True).get('Item')
        merged, retained = merge(existing, incoming)
        if merged == existing:
            unchanged += 1
            continue
        condition = Attr('revision').eq(existing['revision']) if existing else Attr('pk').not_exists()
        table.put_item(Item=merged, ConditionExpression=condition)
        written += 1
        if retained:
            conflicts[incoming['pk']] = retained
    manifest_key = 'MIGRATION#workbook-v' + str(data['source']['version'])
    if not table.get_item(Key={'pk': manifest_key}, ConsistentRead=True).get('Item'):
        table.put_item(Item={'pk': 'MIGRATION#workbook-v' + str(data['source']['version']), 'source': data['source'], 'prospect_count': data['prospect_count'], 'page_count': data['page_count'], 'completed_at': datetime.now(timezone.utc).isoformat()}, ConditionExpression=Attr('pk').not_exists())
    return {'written': written, 'unchanged': unchanged, 'preserved_database_edits': conflicts}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workbook', required=True)
    parser.add_argument('--version', required=True, type=int)
    parser.add_argument('--output')
    parser.add_argument('--apply-table')
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()
    data = plan(args.workbook, args.version)
    if args.output:
        Path(args.output).write_text(json.dumps(data, ensure_ascii=False, indent=2))
    if args.apply_table:
        print(json.dumps(apply(args.apply_table, data, args.region)))
    else:
        print(json.dumps({k: v for k, v in data.items() if k != 'items'}))
    return 0

if __name__ == '__main__':
    sys.exit(main())
