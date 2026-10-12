#!/bin/bash
# One-time setup: Create IAM OIDC provider + deploy role for GitHub Actions
# Run after authenticating: aws login --profile personal
set -e

ACCOUNT_ID="589005473076"
PROFILE="personal"
REGION="us-east-1"
REPO="natemitchcook/personal-site"
ROLE_NAME="github-actions-deploy"

echo "Creating GitHub OIDC provider..."
# Check if provider already exists
if aws iam list-open-id-connect-providers --profile "$PROFILE" | grep -q "token.actions.githubusercontent.com"; then
  echo "OIDC provider already exists, skipping."
else
  THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "$THUMBPRINT" \
    --profile "$PROFILE" \
    --region "$REGION"
  echo "OIDC provider created."
fi

echo "Creating IAM role: $ROLE_NAME..."
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:*"
        }
      }
    }
  ]
}
EOF
)

if aws iam get-role --role-name "$ROLE_NAME" --profile "$PROFILE" 2>/dev/null; then
  echo "Role already exists, updating trust policy..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY" \
    --profile "$PROFILE"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --profile "$PROFILE"
fi

echo "Attaching S3 and CloudFront permissions..."
DEPLOY_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::natemitchcook.com",
        "arn:aws:s3:::natemitchcook.com/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/EKTOMPVYYAD6U"
    }
  ]
}
EOF
)

POLICY_NAME="github-actions-deploy-policy"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

if aws iam get-policy --policy-arn "$POLICY_ARN" --profile "$PROFILE" 2>/dev/null; then
  echo "Policy already exists, creating new version..."
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "$TRUST_POLICY" \
    --set-as-default \
    --profile "$PROFILE" 2>/dev/null || true
else
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "$DEPLOY_POLICY" \
    --profile "$PROFILE"
fi

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN" \
  --profile "$PROFILE"

echo ""
echo "Done! GitHub Actions can now deploy using:"
echo "  role-to-assume: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "Next steps:"
echo "  1. Push the repo changes to GitHub"
echo "  2. Add ANTHROPIC_API_KEY secret to the repo (for change-request workflow)"
echo "  3. Enable branch protection on main"
