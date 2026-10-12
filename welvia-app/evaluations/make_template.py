import json
from pathlib import Path
R={}
def ref(x):return {'Ref':x}
def sub(x):return {'Fn::Sub':x}
def attr(x,y):return {'Fn::GetAtt':[x,y]}
def add(n,t,p,retain=False):
 R[n]={'Type':t,'Properties':p}
 if retain:R[n].update(DeletionPolicy='Retain',UpdateReplacePolicy='Retain')
add('Results','AWS::S3::Bucket',{'PublicAccessBlockConfiguration':dict.fromkeys(['BlockPublicAcls','BlockPublicPolicy','IgnorePublicAcls','RestrictPublicBuckets'],True),'BucketEncryption':{'ServerSideEncryptionConfiguration':[{'ServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]},'VersioningConfiguration':{'Status':'Enabled'},'OwnershipControls':{'Rules':[{'ObjectOwnership':'BucketOwnerEnforced'}]},'Tags':[{'Key':'Project','Value':'Welvia'}]},True)
add('ResultsPolicy','AWS::S3::BucketPolicy',{'Bucket':ref('Results'),'PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Deny','Principal':'*','Action':'s3:*','Resource':[attr('Results','Arn'),sub('${Results.Arn}/*')],'Condition':{'Bool':{'aws:SecureTransport':'false'}}}]}})
add('Data','AWS::DynamoDB::Table',{'BillingMode':'PAY_PER_REQUEST','AttributeDefinitions':[{'AttributeName':k,'AttributeType':'S'} for k in ['pk','sk','gpk','gsk']],'KeySchema':[{'AttributeName':'pk','KeyType':'HASH'},{'AttributeName':'sk','KeyType':'RANGE'}],'GlobalSecondaryIndexes':[{'IndexName':'FeedbackByTime','KeySchema':[{'AttributeName':'gpk','KeyType':'HASH'},{'AttributeName':'gsk','KeyType':'RANGE'}],'Projection':{'ProjectionType':'ALL'}}],'SSESpecification':{'SSEEnabled':True},'PointInTimeRecoverySpecification':{'PointInTimeRecoveryEnabled':True},'TimeToLiveSpecification':{'AttributeName':'expires','Enabled':True},'Tags':[{'Key':'Project','Value':'Welvia'}]},True)
add('DeadLetters','AWS::SQS::Queue',{'SqsManagedSseEnabled':True,'MessageRetentionPeriod':1209600},True)
add('Logs','AWS::Logs::LogGroup',{'LogGroupName':sub('/aws/lambda/${AWS::StackName}-service'),'RetentionInDays':14},True)
add('Role','AWS::IAM::Role',{'AssumeRolePolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]},'Policies':[{'PolicyName':'TenantEvaluations','PolicyDocument':{'Version':'2012-10-17','Statement':[
{'Effect':'Allow','Action':['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:Query'],'Resource':[attr('Data','Arn'),sub('${Data.Arn}/index/FeedbackByTime')]},
{'Effect':'Allow','Action':['dynamodb:GetItem'],'Resource':sub('arn:${AWS::Partition}:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${BusinessTable}')},
{'Effect':'Allow','Action':['s3:GetObject','s3:PutObject'],'Resource':sub('${Results.Arn}/businesses/*')},
{'Effect':'Allow','Action':['bedrock:InvokeModel'],'Resource':sub('arn:${AWS::Partition}:bedrock:${AWS::Region}::foundation-model/amazon.nova-lite-v1:0')},
{'Effect':'Allow','Action':['lambda:InvokeFunction'],'Resource':sub('arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-service')},
{'Effect':'Allow','Action':['sqs:SendMessage'],'Resource':attr('DeadLetters','Arn')},
{'Effect':'Allow','Action':['logs:CreateLogStream','logs:PutLogEvents'],'Resource':attr('Logs','Arn')}]}}]})
add('Service','AWS::Lambda::Function',{'FunctionName':sub('${AWS::StackName}-service'),'Runtime':'python3.12','Handler':'index.handler','Role':attr('Role','Arn'),'Timeout':900,'MemorySize':512,'ReservedConcurrentExecutions':5,'DeadLetterConfig':{'TargetArn':attr('DeadLetters','Arn')},'Environment':{'Variables':{'BUSINESS_TABLE':ref('BusinessTable'),'EVAL_TABLE':ref('Data'),'RESULT_BUCKET':ref('Results'),'WORKER_NAME':sub('${AWS::StackName}-service'),'MODEL_ID':'amazon.nova-lite-v1:0'}},'Code':{'ZipFile':Path('evaluations/service.py').read_text()},'Tags':[{'Key':'Project','Value':'Welvia'}]})
R['Service']['DependsOn']=['Logs','ResultsPolicy']
add('AsyncConfig','AWS::Lambda::EventInvokeConfig',{'FunctionName':ref('Service'),'Qualifier':'$LATEST','MaximumRetryAttempts':0,'MaximumEventAgeInSeconds':3600})
add('Integration','AWS::ApiGatewayV2::Integration',{'ApiId':ref('ApiId'),'IntegrationType':'AWS_PROXY','IntegrationUri':attr('Service','Arn'),'PayloadFormatVersion':'2.0','TimeoutInMillis':29000})
for n,path in [('Root',''),('Children','/{proxy+}')]:add(n+'Route','AWS::ApiGatewayV2::Route',{'ApiId':ref('ApiId'),'RouteKey':'ANY /api/businesses/{businessId}/evaluations'+path,'Target':{'Fn::Join':['/',['integrations',ref('Integration')]]}})
add('Invoke','AWS::Lambda::Permission',{'FunctionName':ref('Service'),'Action':'lambda:InvokeFunction','Principal':'apigateway.amazonaws.com','SourceAccount':ref('AWS::AccountId'),'SourceArn':sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiId}/*/*/api/businesses/*/evaluations*')})
add('ErrorAlarm','AWS::CloudWatch::Alarm',{'AlarmDescription':'Welvia evaluation execution errors. Inspect logs and dead letter queue.','Namespace':'AWS/Lambda','MetricName':'Errors','Dimensions':[{'Name':'FunctionName','Value':ref('Service')}],'Statistic':'Sum','Period':300,'EvaluationPeriods':1,'Threshold':1,'ComparisonOperator':'GreaterThanOrEqualToThreshold','TreatMissingData':'notBreaching'})
add('DeployPolicy','AWS::IAM::Policy',{'PolicyName':sub('${AWS::StackName}-code-deploy'),'Roles':[ref('DeployRoleName')],'PolicyDocument':{'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['lambda:UpdateFunctionCode','lambda:GetFunctionConfiguration'],'Resource':attr('Service','Arn')}]}})
T={'AWSTemplateFormatVersion':'2010-09-09','Description':'Private Welvia agent evaluations, tenant history and feedback. No customer messaging or payments.','Parameters':{'DeployRoleName':{'Type':'String','Default':'welvia-app-github-deploy','AllowedPattern':'[a-zA-Z0-9+=,.@_-]+'},'BusinessTable':{'Type':'String','AllowedPattern':'[a-zA-Z0-9_.-]+','Default':'welvia-pilot-Data-4KCGX2QW1VR'},'ApiId':{'Type':'String','AllowedPattern':'[a-z0-9]+','Default':'8yh6tbjyf2'}},'Resources':R,'Outputs':{n:{'Description':n,'Value':ref(r)} for n,r in [('Table','Data'),('Bucket','Results'),('Function','Service')]}}
Path('evaluations/infrastructure.json').write_text(json.dumps(T,indent=2)+'\n')
