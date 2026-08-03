"""PaddleOCR over a bank statement, returning the fields RelayFlow needs.

Why this is a separate service rather than part of the app: PaddleOCR is
Python, and RelayFlow is TypeScript on Supabase. There is no Deno build of it,
so it cannot live in an Edge function, and Next.js cannot host it either. A
small container it is.

What it returns is deliberately narrow — an IBAN, an account holder, a bank
name — and every value carries a confidence. Nothing here decides anything: the
candidate confirms every field before QSTP sees it, and the IBAN is dropped
entirely rather than returned unsure, because a wrong IBAN pre-filled in a box
is worse than an empty one.
"""

from __future__ import annotations

import hmac
import os
import re
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, UploadFile, File
from pydantic import BaseModel

from iban import find_ibans

SHARED_SECRET = os.environ.get("OCR_SHARED_SECRET", "")
MAX_BYTES = 10 * 1024 * 1024

_reader: Any = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Load the model once, at startup.

    PaddleOCR takes several seconds to initialise. Doing it per request would
    make the first upload of every cold container time out, and the candidate
    would see an extraction failure that was really a deployment detail.
    """
    global _reader
    from paddleocr import PaddleOCR

    _reader = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    yield
    _reader = None


app = FastAPI(title="RelayFlow OCR", lifespan=lifespan)


class Field(BaseModel):
    key: str
    label: str
    extracted: str | None
    confidence: float | None


class ExtractionResponse(BaseModel):
    fields: list[Field]
    # Returned so the caller can tell "we read the page and found no IBAN" from
    # "we could not read the page at all". Only one of those is something the
    # candidate can fix by photographing it again.
    lines_read: int


def _authorise(provided: str | None) -> None:
    if not SHARED_SECRET:
        # Refuses to run rather than defaulting to open. An unconfigured secret
        # is a deployment that is not finished.
        raise HTTPException(status_code=503, detail="not configured")
    # Constant-time: a plain == leaks how much of the secret was right, and this
    # is a value an attacker can submit as often as they like.
    if not provided or not hmac.compare_digest(provided, SHARED_SECRET):
        raise HTTPException(status_code=401, detail="not permitted")


ACCOUNT_HOLDER_PATTERNS = [
    re.compile(r"ACCOUNT\s*(?:HOLDER|NAME)\s*[:\-]?\s*([A-Z][A-Z .'-]{3,60})"),
    re.compile(r"CUSTOMER\s*NAME\s*[:\-]?\s*([A-Z][A-Z .'-]{3,60})"),
    re.compile(r"NAME\s*[:\-]\s*([A-Z][A-Z .'-]{3,60})"),
]

KNOWN_BANKS = [
    "QATAR NATIONAL BANK",
    "DOHA BANK",
    "COMMERCIAL BANK",
    "QATAR ISLAMIC BANK",
    "MASRAF AL RAYAN",
    "AHLI BANK",
    "DUKHAN BANK",
    "QATAR INTERNATIONAL ISLAMIC BANK",
]


def _account_holder(text: str) -> tuple[str | None, float | None]:
    for pattern in ACCOUNT_HOLDER_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1).strip().title(), 0.74
    return None, None


def _bank_name(text: str) -> tuple[str | None, float | None]:
    # Longest first, so "Qatar International Islamic Bank" is not matched as
    # "Qatar Islamic Bank" by an unlucky ordering.
    for name in sorted(KNOWN_BANKS, key=len, reverse=True):
        if name in text:
            return name.title(), 0.88
    return None, None


@app.get("/health")
def health() -> dict[str, object]:
    return {"ok": _reader is not None}


@app.post("/extract/bank-statement", response_model=ExtractionResponse)
async def extract_bank_statement(
    file: UploadFile = File(...),
    x_ocr_secret: str | None = Header(default=None),
) -> ExtractionResponse:
    _authorise(x_ocr_secret)

    payload = await file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="file too large")
    if not payload:
        raise HTTPException(status_code=400, detail="empty file")
    if _reader is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    import numpy as np
    from PIL import Image
    import io

    try:
        image = Image.open(io.BytesIO(payload)).convert("RGB")
    except Exception as error:  # noqa: BLE001 — any decode failure is the same answer
        raise HTTPException(status_code=400, detail="unreadable image") from error

    result = _reader.ocr(np.array(image), cls=True)
    lines: list[tuple[str, float]] = []
    for page in result or []:
        for entry in page or []:
            text, confidence = entry[1]
            lines.append((str(text), float(confidence)))

    joined = "\n".join(text for text, _ in lines).upper()
    # The floor across the page. An IBAN read off a page the model was unsure
    # about is itself unsure, however clean the string looks.
    page_confidence = min((confidence for _, confidence in lines), default=0.5)

    fields: list[Field] = []

    ibans = find_ibans(joined, base_confidence=min(0.9, page_confidence + 0.1))
    best = ibans[0] if ibans else None
    fields.append(
        Field(
            key="iban",
            label="IBAN",
            extracted=best.value if best else None,
            confidence=best.confidence if best else None,
        )
    )

    holder, holder_confidence = _account_holder(joined)
    fields.append(
        Field(
            key="account_holder",
            label="Account holder",
            extracted=holder,
            confidence=holder_confidence,
        )
    )

    bank, bank_confidence = _bank_name(joined)
    fields.append(
        Field(key="bank_name", label="Bank", extracted=bank, confidence=bank_confidence)
    )

    return ExtractionResponse(fields=fields, lines_read=len(lines))
