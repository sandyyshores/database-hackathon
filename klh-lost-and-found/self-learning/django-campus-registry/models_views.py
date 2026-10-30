from django.db import models
from django.http import JsonResponse
from django.views import View


class UnclaimedArchivePolicy(models.Model):
    category_slug = models.CharField(max_length=40, unique=True)
    hold_days = models.PositiveIntegerField(default=30)
    disposal_action = models.CharField(max_length=120, default="Student Welfare Donation Box")

    class Meta:
        app_label = "campus_registry"


class PolicyListView(View):
    def get(self, request):
        policies = list(
            UnclaimedArchivePolicy.objects.values("category_slug", "hold_days", "disposal_action")
        )
        return JsonResponse({"campus": "KLH University", "policies": policies})
