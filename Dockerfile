FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY backend/   ./backend/
COPY frontend/  ./frontend/
COPY data/      ./data/

EXPOSE 5000

ENV PORT=5000

CMD ["python", "backend/app.py"]
