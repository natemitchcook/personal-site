#!/bin/bash
# Deploy personal site to S3
# Uses isolated 'personal' AWS profile

set -e

echo "🚀 Deploying to S3..."

# Build the interactive cards page before syncing static files.
(cd cards-app && npm ci && npm run build)

# Sync files to S3 bucket
aws s3 sync . s3://natemitchcook.com \
  --profile personal \
  --exclude ".git/*" \
  --exclude ".github/*" \
  --exclude "deploy.sh" \
  --exclude "README.md" \
  --exclude "DEPLOY.md" \
  --exclude "cards-app/*" \
  --exclude ".gitignore" \
  --delete

# CloudFront uses an S3 origin, so /cards needs its own object key.
aws s3 cp cards/index.html s3://natemitchcook.com/cards \
  --profile personal \
  --content-type "text/html; charset=utf-8"

# Set proper content types
aws s3 cp s3://natemitchcook.com/index.html s3://natemitchcook.com/index.html \
  --profile personal \
  --content-type "text/html" \
  --metadata-directive REPLACE

aws s3 cp s3://natemitchcook.com/profile.png s3://natemitchcook.com/profile.png \
  --profile personal \
  --content-type "image/png" \
  --metadata-directive REPLACE

aws s3 cp s3://natemitchcook.com/favicon.png s3://natemitchcook.com/favicon.png \
  --profile personal \
  --content-type "image/png" \
  --metadata-directive REPLACE

echo "✅ Deployment complete!"
echo "🌐 Visit: https://natemitchcook.com"
