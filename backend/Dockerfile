FROM python:3.11-slim

# Install FluidSynth and its dependencies at the system level
RUN apt-get update && apt-get install -y \
    fluidsynth \
    libfluidsynth-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["gunicorn", "--bind", "0.0.0.0:10000", "app:app"]