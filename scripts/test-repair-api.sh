#!/bin/bash

# Test script for the embedding repair API endpoint
# This script tests the repair API functionality

echo "🔍 Testing Knowledge Base Repair API..."

# Base URL (adjust if needed)
BASE_URL="http://localhost:3000"
API_ENDPOINT="$BASE_URL/api/v1/knowledge-base/repair"

# You'll need to replace this with a valid admin token
# AUTH_TOKEN="your-admin-token-here"

echo ""
echo "📋 Available tests:"
echo "1. Get repair status (GET)"
echo "2. Identify missing embeddings (POST - identify)"
echo "3. Validate embeddings (POST - validate)"
echo "4. Dry run repair (POST - repair with dryRun=true)"
echo "5. Actual repair (POST - repair with dryRun=false)"
echo ""

# Test 1: Get current repair status
echo "🔍 Test 1: Getting current repair status..."
echo "GET $API_ENDPOINT"
echo ""
echo "curl -X GET '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json'"
echo ""

# Test 2: Identify missing embeddings
echo "🔍 Test 2: Identifying missing embeddings..."
echo "POST $API_ENDPOINT"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\": \"identify\"}'"
echo ""

# Test 3: Validate embeddings
echo "🔍 Test 3: Validating embedding integrity..."
echo "POST $API_ENDPOINT"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\": \"validate\"}'"
echo ""

# Test 4: Dry run repair
echo "🔍 Test 4: Dry run repair (preview what would be fixed)..."
echo "POST $API_ENDPOINT"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\": \"repair\", \"dryRun\": true}'"
echo ""

# Test 5: Actual repair
echo "🔧 Test 5: Actual repair (CAUTION: This will modify the database!)..."
echo "POST $API_ENDPOINT"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\": \"repair\", \"dryRun\": false}'"
echo ""

# Test 6: Repair specific chunks
echo "🎯 Test 6: Repair specific chunks by ID..."
echo "POST $API_ENDPOINT"
echo ""
echo "curl -X POST '$API_ENDPOINT' \\"
echo "  -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"action\": \"repair\", \"chunkIds\": [\"e4d220a2-955d-4208-a2aa-0731f2e0f7e0\"], \"dryRun\": false}'"
echo ""

echo "📋 Notes:"
echo "- Replace \$AUTH_TOKEN with a valid admin authentication token"
echo "- Make sure the server is running on $BASE_URL"
echo "- The 'repair' action with dryRun=false will actually modify the database"
echo "- Check server logs for detailed repair progress"
echo ""

echo "✅ Test script ready! Copy and run the curl commands above with proper authentication."