"""Finding an IBAN in OCR output, and refusing the ones that are wrong.

The IBAN is the field whose mis-read costs somebody their salary. OCR gets it
wrong in predictable ways — 0/O, 1/I, 5/S, 8/B — and a wrong IBAN that *looks*
like an IBAN is far more dangerous than no IBAN at all, because it arrives
pre-filled in a box a tired person will accept.

So nothing here returns a candidate string it has not checked. Mod-97 catches
essentially every single-character substitution and transposition, which is
exactly the class of error OCR makes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Qatar: QA + 2 check digits + 4 bank characters + 21 alphanumeric = 29.
QATAR_IBAN_LENGTH = 29

# Deliberately loose about spacing — IBANs are printed in groups of four and
# OCR reproduces the gaps unpredictably — and strict about everything else.
IBAN_PATTERN = re.compile(r"\b([A-Z]{2}[0-9]{2}(?:[ -]?[A-Z0-9]){10,30})\b")

# The substitutions OCR actually makes, applied only when the raw read fails
# mod-97. Tried one at a time and accepted only if the result validates, so a
# correction can never turn a wrong-but-valid IBAN into a different valid one.
CONFUSIONS = {
    "O": "0",
    "o": "0",
    "I": "1",
    "l": "1",
    "S": "5",
    "B": "8",
    "Z": "2",
    "G": "6",
}


@dataclass(frozen=True)
class IbanCandidate:
    value: str
    confidence: float
    corrected: bool


def normalise(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", raw.upper())


def is_valid(iban: str) -> bool:
    """The ISO 13616 mod-97 check.

    Move the first four characters to the end, replace each letter with its
    position in the alphabet plus nine, and the whole thing read as an integer
    must be congruent to 1 modulo 97.
    """
    value = normalise(iban)
    if len(value) < 15 or len(value) > 34:
        return False

    rotated = value[4:] + value[:4]
    digits = ""
    for character in rotated:
        if character.isdigit():
            digits += character
        elif character.isalpha():
            digits += str(ord(character) - ord("A") + 10)
        else:
            return False

    return int(digits) % 97 == 1


def _attempt_corrections(value: str) -> str | None:
    """One substitution at a time, accepted only if it validates.

    Deliberately not a search over combinations. Two corrections that happen to
    produce a valid IBAN produce a *different account*, and the odds of that
    being the right one are not odds worth taking with somebody's salary.
    """
    for index, character in enumerate(value):
        replacement = CONFUSIONS.get(character)
        if replacement is None:
            continue
        candidate = value[:index] + replacement + value[index + 1 :]
        if is_valid(candidate):
            return candidate
    return None


def find_ibans(text: str, base_confidence: float = 0.9) -> list[IbanCandidate]:
    """Every valid IBAN in the text, best first.

    A candidate that fails mod-97 and cannot be repaired by a single plausible
    substitution is dropped entirely rather than returned with a low
    confidence. "Here is a number we are not sure about" is how a wrong IBAN
    ends up in a salary field.
    """
    found: list[IbanCandidate] = []
    seen: set[str] = set()

    for match in IBAN_PATTERN.finditer(text.upper()):
        raw = normalise(match.group(1))

        if is_valid(raw):
            candidate = IbanCandidate(raw, base_confidence, corrected=False)
        else:
            repaired = _attempt_corrections(raw)
            if repaired is None:
                continue
            # Materially lower, because a corrected read is a guess that
            # happened to check out. The review screen surfaces anything under
            # 0.8 for exactly this case.
            candidate = IbanCandidate(repaired, min(base_confidence, 0.55), corrected=True)

        if candidate.value in seen:
            continue
        seen.add(candidate.value)
        found.append(candidate)

    # Qatari IBANs first: this is a Qatari programme, and a statement mentioning
    # a foreign IBAN somewhere in its small print should not outrank the account
    # the salary is actually going to.
    found.sort(
        key=lambda item: (
            0 if item.value.startswith("QA") and len(item.value) == QATAR_IBAN_LENGTH else 1,
            0 if not item.corrected else 1,
        )
    )
    return found
