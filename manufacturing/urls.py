from django.urls import path
from .views import (
    BOMListCreateView,
    BOMDetailView,
    MRPCheckView,
    ProductionOrderListCreateView,
    ProductionOrderDetailView,
    ProductionOrderApproveView,
    ProductionOrderReopenView,
    ProductionOrderCancelView,
)
from .sales_request_views import (
    ProductionSalesRequestListCreateAPIView,
    ProductionSalesRequestAcceptPlanAPIView,
    ProductionSalesRequestScheduleAPIView,
    ProductionSalesRequestDispatchAPIView,
    ProductionSalesRequestCreateInvoiceAPIView,
)

urlpatterns = [
    path('sales-requests/', ProductionSalesRequestListCreateAPIView.as_view()),
    path('sales-requests/<int:pk>/accept-plan/', ProductionSalesRequestAcceptPlanAPIView.as_view()),
    path('sales-requests/<int:pk>/schedule/', ProductionSalesRequestScheduleAPIView.as_view()),
    path('sales-requests/<int:pk>/dispatch/', ProductionSalesRequestDispatchAPIView.as_view()),
    path('sales-requests/<int:pk>/create-invoice/', ProductionSalesRequestCreateInvoiceAPIView.as_view()),
    path('boms/', BOMListCreateView.as_view()),
    path('boms/<int:pk>/', BOMDetailView.as_view()),
    path('mrp-check/', MRPCheckView.as_view()),
    path('orders/', ProductionOrderListCreateView.as_view()),
    path('orders/<int:pk>/', ProductionOrderDetailView.as_view()),
    path('orders/<int:pk>/approve/', ProductionOrderApproveView.as_view()),
    path('orders/<int:pk>/reopen/', ProductionOrderReopenView.as_view()),
    path('orders/<int:pk>/cancel/', ProductionOrderCancelView.as_view()),
]
