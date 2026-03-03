# Deployment Guide

## Quick Deploy

```bash
./deploy.sh
```

This uploads to S3 and sets proper content types.

## CloudFront Cache Invalidation

After deploying, clear the CloudFront cache:

```bash
aws cloudfront create-invalidation \
  --distribution-id EKTOMPVYYAD6U \
  --paths "/*" \
  --profile personal \
  --region us-east-1
```

## Infrastructure Details

- **S3 Bucket**: `natemitchcook.com`
- **CloudFront Distribution ID**: `EKTOMPVYYAD6U`
- **Domain**: `natemitchcook.com`
- **AWS Profile**: `personal`
- **Region**: `us-east-1`

## Full Deploy Command

```bash
cd /Users/nccook/projects/personal-site && \
./deploy.sh && \
aws cloudfront create-invalidation \
  --distribution-id EKTOMPVYYAD6U \
  --paths "/*" \
  --profile personal \
  --region us-east-1
```
