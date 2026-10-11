from django.apps import AppConfig
from django.db.models.signals import post_migrate


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from .db_security import lock_public_schema
        post_migrate.connect(lock_public_schema, sender=self, dispatch_uid="core.lock_public_schema")
