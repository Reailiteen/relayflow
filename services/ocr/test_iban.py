"""The IBAN extractor.

Every assertion here is about *not* returning something. Finding an IBAN is
easy; the job is refusing the ones that are subtly wrong, because those are the
ones that reach a salary field.

    cd services/ocr && python -m pytest
"""

from iban import find_ibans, is_valid, normalise

# Real-shaped Qatari IBANs, mod-97 valid. QA + check digits + 4-char bank code
# + 21 alphanumeric = 29 characters.
VALID_QA = "QA58DOHB00001234567890ABCDEFG"
VALID_QA_2 = "QA54QNBA000000000000693123456"


def test_valid_qatari_iban_passes_mod97():
    assert is_valid(VALID_QA)
    assert is_valid(VALID_QA_2)


def test_normalisation_ignores_the_way_it_is_printed():
    # IBANs are printed in groups of four and OCR reproduces the gaps
    # unpredictably.
    assert normalise("qa58 dohb 0000 1234 5678 90ab cdefg") == VALID_QA
    assert is_valid("QA58-DOHB-0000-1234-5678-90AB-CDEFG")


def test_a_single_wrong_character_fails():
    # The whole point of mod-97: this is what a mis-read digit looks like, and
    # it is a different account.
    broken = VALID_QA[:5] + ("X" if VALID_QA[5] != "X" else "Y") + VALID_QA[6:]
    assert not is_valid(broken)


def test_a_transposition_fails():
    swapped = VALID_QA[:10] + VALID_QA[11] + VALID_QA[10] + VALID_QA[12:]
    if swapped != VALID_QA:
        assert not is_valid(swapped)


def test_finds_an_iban_in_surrounding_text():
    text = f"ACCOUNT NAME: LAYLA AHMED\nIBAN {VALID_QA}\nDOHA BANK"
    found = find_ibans(text)
    assert [item.value for item in found] == [VALID_QA]
    assert not found[0].corrected


def test_repairs_one_plausible_ocr_confusion():
    # O for 0 is the substitution PaddleOCR makes most on statement paper.
    misread = VALID_QA.replace("0", "O", 1)
    found = find_ibans(misread)
    assert [item.value for item in found] == [VALID_QA]
    assert found[0].corrected
    # And says so with a confidence the review screen will highlight.
    assert found[0].confidence < 0.8


def test_drops_a_candidate_it_cannot_repair():
    # Two wrong characters. A search over combinations might find *a* valid
    # IBAN, but it would be a different account, and the odds of it being the
    # right one are not odds worth taking with somebody's salary.
    beyond_repair = "QA58DOHB00001234567890ABCDEXY"
    assert find_ibans(beyond_repair) == []


def test_returns_nothing_rather_than_something_unsure():
    assert find_ibans("no account details on this page at all") == []
    assert find_ibans("ACCOUNT 12345678") == []


def test_prefers_the_qatari_iban_over_a_foreign_one_in_the_small_print():
    foreign = "GB82WEST12345698765432"
    assert is_valid(foreign)
    found = find_ibans(f"Correspondent: {foreign}\nYour IBAN: {VALID_QA}")
    assert found[0].value == VALID_QA


def test_prefers_a_clean_read_over_a_repaired_one():
    misread = VALID_QA_2.replace("0", "O", 1)
    found = find_ibans(f"{misread}\n{VALID_QA}")
    assert found[0].value == VALID_QA
    assert not found[0].corrected


def test_does_not_report_the_same_account_twice():
    text = f"{VALID_QA} appears in the header and {VALID_QA} again in the footer"
    assert len(find_ibans(text)) == 1
