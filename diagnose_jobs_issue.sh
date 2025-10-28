#!/bin/bash
echo "=== Jobs Issue Diagnostic ==="

# 1. Check if services are running
echo "1. Service Status:"
pm2 list | grep -E "(user-service|index)"

# 2. Test login and token extraction
echo "2. Testing Authentication:"
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"kin","password":"Password@123"}')
echo "Login success:" $(echo "$LOGIN_RESPONSE" | grep -q "success.*true" && echo "YES" || echo "NO")

# 3. Get token and decode it
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json, base64
try:
    data = json.load(sys.stdin)
    token = data.get('idToken') or data.get('token')
    if token:
        parts = token.split('.')
        payload = json.loads(base64.b64decode(parts[1] + '=='))
        print(payload.get('sub'))
except:
    print('')
")

echo "JWT User ID (sub): $TOKEN"

# 4. Check DynamoDB for this user ID
echo "3. Checking DynamoDB for user ID: $TOKEN"
if [ -n "$TOKEN" ]; then
  aws dynamodb scan \
    --table-name cab432a01-tvideos \
    --filter-expression "userId = :uid" \
    --expression-attribute-values "{\":uid\":{\"S\":\"$TOKEN\"}}" \
    --query "Count" \
    --output text
else
  echo "No token to check"
fi

# 5. Check all user IDs in DynamoDB
echo "4. All User IDs in DynamoDB:"
aws dynamodb scan \
  --table-name cab432a01-tvideos \
  --query "Items[].userId.S" \
  --output text | tr '\t' '\n' | sort | uniq -c

echo "=== Diagnostic Complete ==="
