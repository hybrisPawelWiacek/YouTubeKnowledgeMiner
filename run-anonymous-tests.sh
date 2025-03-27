#!/bin/bash

# Run individual test scripts with proper ESM import syntax
echo "=== Running Anonymous User Flow Test ==="
node --import tsx scripts/test-anonymous-flow.ts
echo ""

echo "=== Running Anonymous User Client Test ==="
node --import tsx scripts/test-anonymous-client.ts
echo ""

echo "=== Running Anonymous User Edge Cases Test ==="
node --import tsx scripts/test-anonymous-edge-cases.ts
echo ""

echo "=== Running Anonymous Sessions Test ==="
node --import tsx scripts/test-anonymous-sessions.ts
echo ""

echo "=== All tests complete! ==="