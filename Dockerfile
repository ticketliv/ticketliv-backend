# Use Node.js LTS (Hydrogen)
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Install build dependencies (needed for some native modules if any)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# --- Release Image ---
FROM node:20-slim

WORKDIR /app

# Install system dependencies for 'sharp' or other media libs if needed
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Start application
CMD ["node", "src/app.js"]
