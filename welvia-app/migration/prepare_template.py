"""Offline-only, additive migration proposal from a freshly exported live CFN template.
No AWS API calls. No credentials read. Review a change set before applying output.
"""
import argparse, copy, json
from pathlib import Path

def prepare(source, phase, zone_id):
    if phase not in ('prepare', 'cutover'):
        raise ValueError('Unknown migration phase')
    if not zone_id.startswith('Z') or not zone_id.isalnum():
        raise ValueError('Expected an inspected Route53 hosted-zone ID')
    result = copy.deepcopy(source)
    resources = result['Resources']
    cdn = resources['CDN']['Properties']['DistributionConfig']
    aliases = cdn.get('Aliases', [])
    if not isinstance(aliases, list) or 'welvia.natemitchcook.com' not in aliases:
        raise ValueError('Unexpected distribution aliases; inspect manually')
    if cdn['DefaultCacheBehavior'].get('LambdaFunctionAssociations'):
        raise ValueError('Existing edge association must be reviewed manually')
    old_functions = cdn['DefaultCacheBehavior'].get('FunctionAssociations', [])
    expected = [{'EventType': 'viewer-request', 'FunctionARN': {'Fn::GetAtt': ['WelviaDomainRedirect', 'FunctionMetadata.FunctionARN']}}]
    if old_functions and old_functions != expected:
        raise ValueError('Existing viewer function must not be overwritten')
    result.setdefault('Parameters', {})['MigrationCertificateArn'] = {
        'Type': 'String',
        'AllowedPattern': 'arn:aws:acm:us-east-1:[0-9]{12}:certificate/[a-f0-9-]+',
        'Description': 'Required issued ACM certificate covering both welvia.app and welvia.natemitchcook.com; no default.'
    }
    if 'welvia.app' not in aliases:
        aliases.append('welvia.app')
    cdn['ViewerCertificate']['AcmCertificateArn'] = {'Ref': 'MigrationCertificateArn'}
    resources['WelviaAppDNS'] = {'Type': 'AWS::Route53::RecordSetGroup', 'Properties': {
        'HostedZoneId': zone_id,
        'RecordSets': [{'Name': 'welvia.app.', 'Type': kind, 'AliasTarget': {
            'DNSName': {'Fn::GetAtt': ['CDN', 'DomainName']},
            'HostedZoneId': 'Z2FDTNDATAQYW2', 'EvaluateTargetHealth': False}}
            for kind in ('A', 'AAAA')]}}
    if phase == 'cutover':
        resources['WelviaDomainRedirect'] = {'Type': 'AWS::CloudFront::Function', 'Properties': {
            'Name': {'Fn::Sub': '${AWS::StackName}-domain-redirect'}, 'AutoPublish': True,
            'FunctionConfig': {'Comment': 'Welvia legacy host/path redirects and directory indexes', 'Runtime': 'cloudfront-js-2.0'},
            'FunctionCode': (Path(__file__).parent/'viewer-request.js').read_text()}}
        cdn['DefaultCacheBehavior']['FunctionAssociations'] = expected
        resources['ApiFunction']['Properties']['Environment']['Variables']['SITE_URL'] = 'https://welvia.app'
        result['Outputs']['SiteUrl']['Value'] = 'https://welvia.app'
    # Protect the deployment's exact bootstrap, runtime credentials and API behavior.
    assert resources['ApiFunction']['Properties']['Code'] == source['Resources']['ApiFunction']['Properties']['Code']
    assert cdn['CacheBehaviors'] == source['Resources']['CDN']['Properties']['DistributionConfig']['CacheBehaviors']
    assert resources['DNS'] == source['Resources']['DNS']
    for name, item in source['Resources'].items():
        if name not in ('CDN', 'ApiFunction', 'WelviaAppDNS', 'WelviaDomainRedirect'):
            assert resources[name] == item, name
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--phase', required=True, choices=['prepare', 'cutover'])
    parser.add_argument('--zone-id', required=True)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error('Preserve the original export; choose a different output file')
    args.output.write_text(json.dumps(prepare(json.loads(args.input.read_text()), args.phase, args.zone_id), indent=2)+'\n')
    print('Wrote offline proposal only. Certificate, costs, change set and rollout gates require review.')
