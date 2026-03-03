#!/bin/bash
# Deploy personal site to S3
# Uses isolated 'personal' AWS profile

set -e

echo "🚀 Deploying to S3..."

# Sync files to S3 bucket
aws s3 sync . s3://natemitchcook.com \
  --profile personal \
  --exclude ".git/*" \
  --exclude "deploy.sh" \
  --exclude "README.md" \
  --delete

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
