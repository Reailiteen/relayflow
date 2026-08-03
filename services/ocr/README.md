# OCR service

Reads a bank statement and returns the IBAN, account holder and bank name, each
with a confidence.

Separate from the rest of RelayFlow because PaddleOCR is Python. There is no
Deno build, so it cannot live in a Supabase Edge function, and Next.js cannot
host it either.

## Running it

```bash
export OCR_SHARED_SECRET="$(openssl rand -hex 32)"
docker build -t relayflow-ocr .
docker run -p 8000:8000 -e OCR_SHARED_SECRET="$OCR_SHARED_SECRET" relayflow-ocr
```

Then point the web app at it:

```bash
# apps/web/.env.local
OCR_SERVICE_URL=http://localhost:8000
OCR_SHARED_SECRET=…            # the same value
```

Without `OCR_SERVICE_URL` the app skips the call and the candidate fills the
fields in by hand — which is a worse experience and a correct one, rather than
an extraction that silently never completes.

## The IBAN is the whole job

Everything else on a bank statement is a nicety. The IBAN is the field whose
mis-read sends somebody's salary to a stranger, and OCR gets it wrong in
predictable ways: `0`/`O`, `1`/`I`, `5`/`S`, `8`/`B`.

So `iban.py` does three things, and the second and third matter more than the
first:

1. Finds candidates by pattern.
2. **Validates every one with mod-97**, which catches essentially all
   single-character substitutions and transpositions — exactly the class of
   error OCR makes.
3. **Drops anything it cannot validate.** A candidate that fails and cannot be
   repaired by one plausible substitution is not returned at all. "Here is a
   number we are not sure about" is how a wrong IBAN reaches a salary field,
   because it arrives pre-filled in a box a tired person accepts.

A repaired read comes back at confidence 0.55, below the 0.8 threshold
`lowConfidenceFields` uses, so the review screen calls it out rather than
letting it pass as read.

Corrections are tried one character at a time and accepted only if the result
validates. Deliberately not a search over combinations: two corrections that
happen to produce a valid IBAN produce a *different account*.

## Tests

```bash
python -m pytest
```

Every assertion is about refusing something. Finding an IBAN is easy.

## Deploying

Any container host — Fly, Railway, Cloud Run. It holds no data and no
credentials beyond its own shared secret, and can be scaled to zero: the only
cost of a cold start is the model load, which the image warms at build time.
