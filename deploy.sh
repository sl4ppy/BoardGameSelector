#!/bin/bash

# Board Game Selector Docker Deployment Script

set -e

echo "🎲 Board Game Selector - Docker Deployment"
echo "==========================================="

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Create database directory
echo "📁 Creating database directory..."
mkdir -p database

# Stop existing container if running
if docker ps -q -f name=boardgame-selector | grep -q .; then
    echo "🛑 Stopping existing container..."
    docker stop boardgame-selector
    docker rm boardgame-selector
fi

# Build the image
echo "🔨 Building Docker image..."
docker build -t boardgame-selector .

# Run the container
echo "🚀 Starting container..."
docker run -d \
    --name boardgame-selector \
    -p 3000:3000 \
    -v $(pwd)/database:/app/database \
    --user $(id -u):$(id -g) \
    --restart unless-stopped \
    boardgame-selector

# Wait a moment for startup
sleep 3

# Check if container is running
if docker ps -q -f name=boardgame-selector | grep -q .; then
    echo "✅ Container is running!"
    echo "🌐 Frontend: http://localhost:3000"
    echo "🔍 Health check: http://localhost:3000/api/health"
    echo ""
    echo "📋 Container logs:"
    docker logs boardgame-selector
    echo ""
    echo "🔧 To view logs: docker logs boardgame-selector"
    echo "🛑 To stop: docker stop boardgame-selector"
    echo "🗑️  To remove: docker rm boardgame-selector"
else
    echo "❌ Container failed to start!"
    echo "📋 Checking logs..."
    docker logs boardgame-selector
    exit 1
fi