import os
import re
import unicodedata

from django.conf import settings
from storages.backends.s3 import S3Storage

# Macedonian/Serbian/Russian Cyrillic -> Latin, so object keys are plain ASCII.
_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ѓ": "gj", "е": "e", "ж": "zh", "з": "z",
    "ѕ": "dz", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "ќ": "kj", "у": "u", "ф": "f", "х": "h",
    "ц": "c", "ч": "ch", "џ": "dzh", "ш": "sh", "ђ": "dj", "ћ": "c", "й": "j", "ы": "y",
    "đ": "dj", "э": "e", "ю": "ju", "я": "ja", "ё": "e", "ь": "", "ъ": "", "щ": "shch",
}


def ascii_filename(name):
    """'ф-ра Б04.pdf' -> 'f-ra_B04.pdf'. Supabase Storage rejects object keys with
    non-ASCII characters, so every uploaded file name goes through this. The original
    name is kept in Document.title."""
    base, ext = os.path.splitext(os.path.basename(name or "file"))
    out = []
    for ch in base:
        low = ch.lower()
        if low in _CYR:
            lat = _CYR[low]
            out.append(lat.capitalize() if ch != low and lat else lat)
        else:
            out.append(ch)
    base = unicodedata.normalize("NFKD", "".join(out)).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._-") or "file"
    ext = re.sub(r"[^A-Za-z0-9.]+", "", ext)[:10]
    return (base[:100] + ext.lower())


class SupabasePublicStorage(S3Storage):
    """
    Uploads still go through the normal S3-compatible API (boto3 signs those writes
    correctly with SigV4). But for reading a file back, we skip S3 presigned-URL
    generation entirely — Supabase's S3-compatible endpoint doesn't reliably support
    it — and instead build Supabase's own public object URL directly, since the
    bucket is public. This is the same URL format you get from the Supabase dashboard.
    """

    def get_valid_name(self, name):
        return ascii_filename(name)

    def url(self, name, parameters=None, expire=None, http_method=None):
        base = settings.SUPABASE_PUBLIC_URL_BASE
        return f"{base}/{self.bucket_name}/{name}"
