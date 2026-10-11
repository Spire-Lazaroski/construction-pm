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


class SupabaseStorage(S3Storage):
    """
    Documents bucket on Supabase Storage, accessed through its S3-compatible API.

    The bucket is private: every link handed to the browser is a SigV4 presigned URL
    that expires after AWS_QUERYSTRING_EXPIRE seconds (django-storages' default
    S3Storage.url). SUPABASE_PUBLIC_URLS=1 is a fallback for a public bucket and
    builds Supabase's permanent /object/public/ URLs instead.
    """

    def get_valid_name(self, name):
        return ascii_filename(name)

    def url(self, name, parameters=None, expire=None, http_method=None):
        if getattr(settings, "SUPABASE_PUBLIC_URLS", False):
            return f"{settings.SUPABASE_PUBLIC_URL_BASE}/{self.bucket_name}/{name}"
        return super().url(name, parameters=parameters, expire=expire, http_method=http_method)


# Old name, kept so any reference to it keeps working.
SupabasePublicStorage = SupabaseStorage
