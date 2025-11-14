# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY src/ ./src/
COPY index.html vite.config.js ./

# Build frontend
RUN npm run build

# Stage 2: Python backend
FROM python:3.13-slim

WORKDIR /app

# Install uv
RUN pip install uv

# Copy Python dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies
# Use --no-venv to install directly into system Python
RUN uv sync --frozen --no-dev

# Copy backend source
COPY main.py ./

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/dist ./dist

# Expose port
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

# Run the application with uvicorn
# uvicorn is installed in system Python, so it's in PATH
CMD ["uvicorn", "main:asgi_app", "--host", "0.0.0.0", "--port", "5000"]

