from django.conf import settings
from storages.backends.s3 import S3Storage


class SupabasePublicStorage(S3Storage):
    """
    Uploads still go through the normal S3-compatible API (boto3 signs those writes
    correctly with SigV4). But for reading a file back, we skip S3 presigned-URL
    generation entirely — Supabase's S3-compatible endpoint doesn't reliably support
    it — and instead build Supabase's own public object URL directly, since the
    bucket is public. This is the same URL format you get from the Supabase dashboard.
    """

    def url(self, name, parameters=None, expire=None, http_method=None):
        base = settings.SUPABASE_PUBLIC_URL_BASE
        return f"{base}/{self.bucket_name}/{name}"
