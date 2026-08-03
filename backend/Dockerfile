FROM python:3.11-slim

# Install FluidSynth, its dependencies, and curl for downloading the soundfont
RUN apt-get update && apt-get install -y \
    fluidsynth \
    libfluidsynth-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the soundfont from GitHub Release (too large for git directly)
RUN mkdir -p soundfonts && \
    curl -L -o soundfonts/MuseScore_General.sf2 \
    "https://github.com/BlessingOkpes/solfa-app/releases/download/soundfont-assets/MuseScore_General.sf2"

COPY . .

EXPOSE 10000

CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--access-logfile", "-", "--error-logfile", "-", "app:app"]