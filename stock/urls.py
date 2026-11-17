from django.urls import path
from .views import (
    ItemListCreateAPIView,
    ItemRetrieveUpdateDestroyAPIView,
    StockLedgerAPIView,
    InterUnitStockTransferAPIView
)

urlpatterns = [
    path('items/', ItemListCreateAPIView.as_view(), name='item-list-create'),
    path('items/<int:pk>/', ItemRetrieveUpdateDestroyAPIView.as_view(), name='item-detail'),
    path('stock-ledger/', StockLedgerAPIView.as_view(), name='stock-ledger'),
    path('transfer/', InterUnitStockTransferAPIView.as_view(), name='stock-transfer'),
]