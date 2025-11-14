# Build stage
FROM node:18 as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage with Python support
FROM node:18

WORKDIR /app

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy Python scripts and requirements
COPY scripts/ /app/scripts/

# Install Python dependencies using uv
WORKDIR /app/scripts
RUN uv venv && uv pip install -r requirements.txt
RUN uv run playwright install chromium --with-deps

# Copy Node.js dependencies and server
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY server/ ./server/

# Copy built frontend
COPY --from=build /app/build ./build

# Create temp directory
RUN mkdir -p /app/temp

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Set environment variable for API
ENV NODE_ENV=production
ENV REACT_APP_API_URL=

# Start the Node.js server (serves both API and static files)
CMD ["node", "server/index.js"]
