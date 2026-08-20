from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet)
router.register("phase-categories", views.PhaseCategoryViewSet)
router.register("tasks", views.TaskViewSet)
router.register("vendors", views.VendorViewSet)
router.register("expenses", views.ExpenseViewSet)
router.register("units", views.UnitViewSet)
router.register("customers", views.CustomerViewSet)
router.register("sale-agreements", views.SaleAgreementViewSet)
router.register("installments", views.PaymentInstallmentViewSet)
router.register("issues", views.IssueViewSet)
router.register("documents", views.DocumentViewSet)
router.register("activities", views.ActivityViewSet)

urlpatterns = router.urls
