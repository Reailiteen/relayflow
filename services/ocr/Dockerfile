# PaddleOCR needs a real Linux userland — libgl and libglib for OpenCV, which
# Paddle pulls in. `slim` rather than `alpine`: Paddle ships manylinux wheels
# and musl would mean building it from source.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Where PaddleOCR caches the models it downloads on first use. Pinned so
    # the layer below can warm it at build time rather than on the first
    # candidate's upload.
    HOME=/app

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY iban.py main.py ./

# Download the detection and recognition models into the image. Without this
# the first request after every cold start spends thirty seconds fetching them,
# and the candidate sees an extraction that failed for reasons that have
# nothing to do with their document.
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en', show_log=False)"

EXPOSE 8000

# One worker. The model is several hundred megabytes resident and this is not a
# high-throughput path — one bank statement per candidate, once.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
