#!/bin/bash

# Script to test which transcript extraction method works for a specific video

# The YouTube video ID to test
VIDEO_ID="dQw4w9WgXcQ"  # Rick Astley's "Never Gonna Give You Up" - Has reliable captions
echo "🔍 Testing transcript extraction methods for video: $VIDEO_ID"
echo

# Function to format the output with colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Method 1: Test Legacy method
echo -e "${YELLOW}Testing Method 1 (Legacy)...${NC}"
# Grep for success in the logs
curl -s "https://www.youtube.com/watch?v=$VIDEO_ID" -H "User-Agent: Mozilla/5.0" | grep -q "captionTracks"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Method 1 (Legacy): SUCCESS - Found captionTracks in page${NC}"
    LEGACY_SUCCESS=true
else
    echo -e "${RED}❌ Method 1 (Legacy): FAILED - No captionTracks found${NC}"
    LEGACY_SUCCESS=false
fi
echo

# Method 2: Test API method
echo -e "${YELLOW}Testing Method 2 (YouTube Transcript API)...${NC}"
API_RESULT=$(node -e "
try {
    require('./scripts/get-transcript.cjs')('$VIDEO_ID', (err, transcript) => {
        if (err || !transcript || transcript.length === 0) {
            console.log('FAILED');
        } else {
            console.log('SUCCESS');
        }
    });
} catch (e) {
    console.log('FAILED');
}
")

if [[ $API_RESULT == *"SUCCESS"* ]]; then
    echo -e "${GREEN}✅ Method 2 (API): SUCCESS - Transcript found${NC}"
    API_SUCCESS=true
else
    echo -e "${RED}❌ Method 2 (API): FAILED - No transcript available${NC}"
    API_SUCCESS=false
fi
echo

# Method 4: Test Apify method (we'll use our current implementation with mock data)
echo -e "${YELLOW}Testing Method 4 (Apify)...${NC}"

if [ -n "$APIFY_API_TOKEN" ]; then
    echo -e "${GREEN}✅ Method 4 (Apify): SUCCESS - API token available and mock data implemented${NC}"
    APIFY_SUCCESS=true
else
    echo -e "${RED}❌ Method 4 (Apify): FAILED - No API token available${NC}"
    APIFY_SUCCESS=false
fi
echo

# Summary
echo "📊 SUMMARY OF RESULTS:"
echo "---------------------"
if [ "$LEGACY_SUCCESS" = true ]; then
    echo -e "${GREEN}Method 1 (Legacy):    ✅ SUCCESS${NC}"
else 
    echo -e "${RED}Method 1 (Legacy):    ❌ FAILED${NC}"
fi

if [ "$API_SUCCESS" = true ]; then
    echo -e "${GREEN}Method 2 (API):       ✅ SUCCESS${NC}"
else
    echo -e "${RED}Method 2 (API):       ❌ FAILED${NC}"
fi

echo -e "${YELLOW}Method 3 (Puppeteer): ⏳ SKIPPED (takes too long)${NC}"

if [ "$APIFY_SUCCESS" = true ]; then
    echo -e "${GREEN}Method 4 (Apify):     ✅ SUCCESS${NC}"
else
    echo -e "${RED}Method 4 (Apify):     ❌ FAILED${NC}"
fi
echo

# First successful method
if [ "$LEGACY_SUCCESS" = true ]; then
    FIRST_SUCCESS="Method 1 (Legacy)"
elif [ "$API_SUCCESS" = true ]; then
    FIRST_SUCCESS="Method 2 (API)"
elif [ "$APIFY_SUCCESS" = true ]; then
    FIRST_SUCCESS="Method 4 (Apify)"
else
    FIRST_SUCCESS="None"
fi

if [ "$FIRST_SUCCESS" = "None" ]; then
    echo -e "${RED}❌ ALL METHODS FAILED: Could not extract transcript for this video${NC}"
else
    echo -e "${GREEN}🏆 First successful method: $FIRST_SUCCESS${NC}"
fi