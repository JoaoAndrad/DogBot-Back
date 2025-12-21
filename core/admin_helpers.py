from django.contrib import admin
from django.db import transaction
from django.apps import apps


def merge_identifiers_action(modeladmin, request, queryset):
    """Admin action to merge selected Identifier records into the first selected user.

    Usage: select duplicate Identifier rows and run 'Merge identifiers'. The function
    will reassign related FKs to the primary user and delete duplicate Identifier rows.
    """
    if queryset.count() < 2:
        modeladmin.message_user(request, "Select at least two identifiers to merge.")
        return

    primary = queryset.first()
    others = list(queryset.exclude(pk=primary.pk))
    if not others:
        modeladmin.message_user(request, "No other identifiers to merge.")
        return

    other_pks = [o.pk for o in others]

    with transaction.atomic():
        Identifier = apps.get_model("bot_messages", "Identifier")
        total_updated = 0
        # iterate all models to find FK fields pointing to Identifier
        for model in apps.get_models():
            for field in model._meta.get_fields():
                # handle forward FK/OneToOne relations only
                if getattr(field, "is_relation", False) and getattr(field, "many_to_one", False):
                    if field.related_model is Identifier:
                        # update any records that reference the duplicate identifiers
                        filter_kw = {f"{field.name}__in": other_pks}
                        update_kw = {field.name: primary}
                        qs = model.objects.filter(**filter_kw)
                        if qs.exists():
                            updated = qs.update(**update_kw)
                            total_updated += updated

        # delete the duplicate identifier records
        Identifier.objects.filter(pk__in=other_pks).delete()

    modeladmin.message_user(
        request,
        f"Merged {len(others)} identifiers into {primary.identifier}; reassigned {total_updated} references.",
    )


merge_identifiers_action.short_description = "Merge identifiers into first selected"
from django.contrib import admin
from django.db import transaction
from django.apps import apps


def merge_identifiers_action(modeladmin, request, queryset):
    """Admin action to merge selected Identifier records into the first selected user.

    Usage: select duplicate Identifier rows and run 'Merge identifiers'. The function
    will reassign related FKs to the primary user and delete duplicate Identifier rows.
    """
    if queryset.count() < 2:
        modeladmin.message_user(request, "Select at least two identifiers to merge.")
        return

    primary = queryset.first()
    others = list(queryset.exclude(pk=primary.pk))
    if not others:
        modeladmin.message_user(request, "No other identifiers to merge.")
        return

    other_pks = [o.pk for o in others]

    with transaction.atomic():
        Identifier = apps.get_model("bot_messages", "Identifier")
        total_updated = 0
        # iterate all models to find FK fields pointing to Identifier
        for model in apps.get_models():
            for field in model._meta.get_fields():
                # handle forward FK/OneToOne relations only
                if getattr(field, "is_relation", False) and getattr(field, "many_to_one", False):
                    if field.related_model is Identifier:
                        # update any records that reference the duplicate identifiers
                        filter_kw = {f"{field.name}__in": other_pks}
                        update_kw = {field.name: primary}
                        qs = model.objects.filter(**filter_kw)
                        if qs.exists():
                            updated = qs.update(**update_kw)
                            total_updated += updated

        # delete the duplicate identifier records
        Deleted = Identifier.objects.filter(pk__in=other_pks).delete()

    modeladmin.message_user(
        request,
        f"Merged {len(others)} identifiers into {primary.identifier}; reassigned {total_updated} references.",
    )


merge_identifiers_action.short_description = "Merge identifiers into first selected"
