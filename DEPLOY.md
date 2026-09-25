# Deployment Guide

## Quick Deploy

```bash
./deploy.sh
```

This uploads the root homepage files to S3. For the cards page, use the GitHub Actions workflow or build `cards-app` and upload its generated `cards/` directory and exact `/cards` object separately.

## CloudFront Cache Invalidation

After deploying, clear the CloudFront cache:

```bash
aws cloudfront create-invalidation \
  --distribution-id EKTOMPVYYAD6U \
  --paths "/*" \
  --profile personal \
  --region us-east-1
```

## Cards page

The deployment workflow builds the React cards page from `cards-app/` and uploads `cards/index.html` and its versioned assets. It also copies the HTML to the S3 object key `cards` with `text/html` content type so `https://natemitchcook.com/cards` resolves through CloudFront's S3 origin. When deploying manually, build first, sync `cards/` to `s3://natemitchcook.com/cards/`, copy `cards/index.html` to `s3://natemitchcook.com/cards` with `--content-type 'text/html; charset=utf-8'`, then invalidate CloudFront. Keep generated assets available for any cached HTML until invalidation completes.

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
